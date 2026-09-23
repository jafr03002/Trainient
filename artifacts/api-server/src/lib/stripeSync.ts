import { and, eq, isNull, lte, or } from "drizzle-orm";
import type Stripe from "stripe";
import { db, subscriptionsTable } from "@workspace/db";

// Applies Stripe webhook events to the `subscriptions` row. Kept apart from the
// route so the state transitions can be exercised without a signed request.
//
// `plan` is still only a cosmetic badge - no route checks it - so these handlers
// are about the row telling the truth, not about enforcing a paywall.

// Stripe statuses that still mean "paying for Pro". Everything else - past_due,
// unpaid, canceled, incomplete, incomplete_expired, paused - shows as free. It
// comes back to pro by itself when a later event reports the subscription
// active again (e.g. a retried payment succeeds).
const ENTITLED_STATUSES = new Set<string>(["active", "trialing"]);

export function planForStatus(status: string): "pro" | "free" {
  return ENTITLED_STATUSES.has(status) ? "pro" : "free";
}

// Stripe spells it "canceled"; this table has always stored "cancelled" (see
// customer.subscription.deleted), so keep one spelling in the column.
function storedStatus(status: string): string {
  return status === "canceled" ? "cancelled" : status;
}

// Since API version 2025-03-31.basil (this client pins 2026-05-27.dahlia) the
// billing period lives on each subscription ITEM, and the SDK types no longer
// have a top-level `current_period_end`. The top-level read is kept, behind a
// cast, for events rendered at an older API version on the account.
export function periodEndOf(sub: Stripe.Subscription): Date | null {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  const legacyEnd = (sub as unknown as { current_period_end?: number | null }).current_period_end;
  const end = itemEnd ?? legacyEnd;
  return end ? new Date(end * 1000) : null;
}

function idOf(ref: string | { id: string }): string {
  return typeof ref === "string" ? ref : ref.id;
}

// Stripe does not guarantee delivery order. Only apply an event that is at
// least as new as the last one applied to the row. `lte`, not `lt`: an
// invoice.payment_failed and the subscription.updated it causes share a
// `created` second, and both must still land.
function notOlderThanApplied(eventAt: Date) {
  return or(isNull(subscriptionsTable.lastStripeEventAt), lte(subscriptionsTable.lastStripeEventAt, eventAt));
}

// Stripe event `created` is unix seconds.
export function eventTime(event: Stripe.Event): Date {
  return new Date(event.created * 1000);
}

// checkout.session.completed. `sub` is fetched fresh from Stripe, so its status
// is current. The plan follows it instead of assuming the first payment went
// through.
export async function applyCheckoutCompleted(args: {
  userId: string;
  customerId: string;
  sub: Stripe.Subscription;
  eventAt: Date;
}) {
  const values = {
    plan: planForStatus(args.sub.status),
    status: storedStatus(args.sub.status),
    stripeCustomerId: args.customerId,
    stripeSubscriptionId: args.sub.id,
    currentPeriodEnd: periodEndOf(args.sub),
    lastStripeEventAt: args.eventAt,
    updatedAt: new Date(),
  };
  await db
    .insert(subscriptionsTable)
    .values({ userId: args.userId, ...values })
    .onConflictDoUpdate({ target: subscriptionsTable.userId, set: values });
}

// customer.subscription.updated: sync status + period end, downgrade when the
// subscription stops being paid for. Matched on the subscription id, or, for a
// row that hasn't recorded one yet (this event beat checkout.session.completed),
// on the Stripe customer created at checkout. Returns how many rows changed.
export async function applySubscriptionUpdated(sub: Stripe.Subscription, eventAt: Date): Promise<number> {
  const customerId = idOf(sub.customer);
  const updated = await db
    .update(subscriptionsTable)
    .set({
      plan: planForStatus(sub.status),
      status: storedStatus(sub.status),
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEndOf(sub),
      lastStripeEventAt: eventAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        or(
          eq(subscriptionsTable.stripeSubscriptionId, sub.id),
          and(isNull(subscriptionsTable.stripeSubscriptionId), eq(subscriptionsTable.stripeCustomerId, customerId)),
        ),
        notOlderThanApplied(eventAt),
      ),
    )
    .returning({ userId: subscriptionsTable.userId });
  return updated.length;
}

// customer.subscription.deleted: the subscription is over.
export async function applySubscriptionDeleted(sub: Stripe.Subscription, eventAt: Date): Promise<number> {
  const updated = await db
    .update(subscriptionsTable)
    .set({ plan: "free", status: "cancelled", stripeSubscriptionId: null, lastStripeEventAt: eventAt, updatedAt: new Date() })
    .where(and(eq(subscriptionsTable.stripeSubscriptionId, sub.id), notOlderThanApplied(eventAt)))
    .returning({ userId: subscriptionsTable.userId });
  return updated.length;
}

// invoice.payment_failed: downgrade straight away rather than waiting on the
// subscription.updated (past_due) that normally follows. Stripe keeps retrying
// the payment, and a later success brings the row back to pro through
// applySubscriptionUpdated. An invoice with no subscription (a one-off charge)
// changes nothing.
export async function applyInvoicePaymentFailed(invoice: Stripe.Invoice, eventAt: Date): Promise<number> {
  // `invoice.subscription` moved to `invoice.parent.subscription_details` in
  // 2025-03-31.basil. The old field is read behind a cast for older payloads.
  const subRef =
    invoice.parent?.subscription_details?.subscription ??
    (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (!subRef) return 0;

  const updated = await db
    .update(subscriptionsTable)
    .set({ plan: "free", status: "past_due", lastStripeEventAt: eventAt, updatedAt: new Date() })
    .where(and(eq(subscriptionsTable.stripeSubscriptionId, idOf(subRef)), notOlderThanApplied(eventAt)))
    .returning({ userId: subscriptionsTable.userId });
  return updated.length;
}
