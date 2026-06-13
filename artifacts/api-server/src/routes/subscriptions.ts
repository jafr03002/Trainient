import { Router } from "express";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { db, subscriptionsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { CreateCheckoutSessionBody } from "@workspace/api-zod";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
});

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
    const customer = await stripe.customers.create({ metadata: { userId } });
    customerId = customer.id;
    await db
      .insert(subscriptionsTable)
      .values({ userId, plan: "free", status: "active", stripeCustomerId: customerId })
      .onConflictDoUpdate({
        target: subscriptionsTable.userId,
        set: { stripeCustomerId: customerId },
      });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: { name: "Traintent Pro" },
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
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: req.headers.origin ?? "https://traintent.replit.app",
  });
  res.json({ url: session.url });
});

// Stripe webhook — raw body needed, wired separately
router.post("/subscriptions/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } else {
      event = req.body as Stripe.Event;
    }
  } catch (err) {
    res.status(400).json({ error: "Webhook error" });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    if (userId && session.subscription) {
      const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string);
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
