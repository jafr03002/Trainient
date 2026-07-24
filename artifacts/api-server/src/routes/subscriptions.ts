import { Router } from "express";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { db, subscriptionsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { CreateCheckoutSessionBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

// Constructed lazily, same reasoning as lib/anthropic.ts: this router is always
// mounted and the Stripe SDK throws on an undefined key, so building the client
// at import time would crash the server's (serverless) cold start whenever the
// key isn't set.
let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeClient) return stripeClient;

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY must be set to use billing features");
  }

  stripeClient = new Stripe(apiKey, { apiVersion: "2026-05-27.dahlia" });
  return stripeClient;
}

const router = Router();

router.get("/subscriptions/current", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  let sub = await db.query.subscriptionsTable.findFirst({
    where: eq(subscriptionsTable.userId, userId),
  });
  if (!sub) {
    // Auto-create free subscription
    [sub] = await db
      .insert(subscriptionsTable)
      .values({ userId, plan: "free", status: "active" })
      .returning();
  }
  res.json({
    userId: sub.userId,
    plan: sub.plan,
    status: sub.status,
    stripeCustomerId: sub.stripeCustomerId ?? null,
    stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
  });
});

router.post("/subscriptions/checkout", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const parsed = CreateCheckoutSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { successUrl, cancelUrl } = parsed.data;

  let sub = await db.query.subscriptionsTable.findFirst({
    where: eq(subscriptionsTable.userId, userId),
  });

  let customerId = sub?.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await getStripe().customers.create({ metadata: { userId } });
    customerId = customer.id;
    await db
      .insert(subscriptionsTable)
      .values({ userId, plan: "free", status: "active", stripeCustomerId: customerId })
      .onConflictDoUpdate({
        target: subscriptionsTable.userId,
        set: { stripeCustomerId: customerId },
      });
  }

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: { name: "Trainient Pro" },
          unit_amount: 999,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId },
  });

  res.json({ url: session.url! });
});

router.post("/subscriptions/portal", requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const sub = await db.query.subscriptionsTable.findFirst({
    where: eq(subscriptionsTable.userId, userId),
  });
  if (!sub?.stripeCustomerId) {
    res.status(400).json({ error: "No Stripe customer found" });
    return;
  }
  const session = await getStripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    // A browser-initiated portal request always carries an Origin; APP_URL is
    // the server-side fallback, and localhost keeps local dev working.
    return_url: req.headers.origin ?? process.env.APP_URL ?? "http://localhost:24301",
  });
  res.json({ url: session.url });
});

// Stripe webhook - raw body needed, wired separately
router.post("/subscriptions/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Fail closed: never trust an unverified body. A missing secret is a
  // deployment misconfiguration, and a missing signature means the sender is not
  // Stripe - in both cases we refuse rather than processing a forgeable event.
  if (!webhookSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET is not configured; rejecting webhook");
    res.status(500).json({ error: "Webhook not configured" });
    return;
  }
  if (!sig) {
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  let event: Stripe.Event;
  try {
    // The only path that builds an event: verify the signature against the raw
    // request body. An invalid or forged signature throws and is rejected below.
    event = getStripe().webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err) {
    res.status(400).json({ error: "Webhook error" });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (userId && session.subscription) {
      const stripeSub = await getStripe().subscriptions.retrieve(session.subscription as string);
      const periodEnd = (stripeSub as any).current_period_end
        ? new Date((stripeSub as any).current_period_end * 1000)
        : null;
      await db
        .insert(subscriptionsTable)
        .values({
          userId,
          plan: "pro",
          status: "active",
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          currentPeriodEnd: periodEnd,
        })
        .onConflictDoUpdate({
          target: subscriptionsTable.userId,
          set: {
            plan: "pro",
            status: "active",
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            currentPeriodEnd: periodEnd,
          },
        });
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const stripeSub = event.data.object as Stripe.Subscription;
    await db
      .update(subscriptionsTable)
      .set({ plan: "free", status: "cancelled", stripeSubscriptionId: null })
      .where(eq(subscriptionsTable.stripeSubscriptionId, stripeSub.id));
  }

  res.json({ status: "ok" });
});

export default router;
