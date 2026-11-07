const Stripe = require('stripe');
const Subscription = require('../../models/Subscription');
const Tenant = require('../../models/Tenant');

class StripeService {
    static getStripe() {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            console.warn('Warning: STRIPE_SECRET_KEY environment variable is not configured.');
        }
        return new Stripe(secretKey || 'sk_test_dummy');
    }

    static async createCheckoutSession(tenantId, priceId) {
        const stripe = this.getStripe();
        const tenant = await Tenant.findById(tenantId).lean();
        if (!tenant) throw new Error('Tenant not found');

        let subscription = await Subscription.findOne({ tenantId });
        let customerId = subscription?.stripeCustomerId;

        if (!customerId) {
            const customer = await stripe.customers.create({
                name: tenant.name,
                metadata: { tenantId: tenantId.toString() }
            });
            customerId = customer.id;

            if (!subscription) {
                subscription = await Subscription.create({
                    tenantId,
                    stripeCustomerId: customerId,
                    status: 'inactive'
                });
            } else {
                subscription.stripeCustomerId = customerId;
                await subscription.save();
            }
        }

        const domain = process.env.FRONTEND_DOMAIN || process.env.UI_LINK || 'http://localhost:5173';

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId || process.env.STRIPE_PRICE_ID_BASIC,
                    quantity: 1
                }
            ],
            mode: 'subscription',
            success_url: `${domain}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${domain}/dashboard/billing?canceled=true`,
            metadata: {
                tenantId: tenantId.toString()
            }
        });

        return { url: session.url, sessionId: session.id };
    }

    static async createCustomerPortalSession(tenantId) {
        const stripe = this.getStripe();
        const subscription = await Subscription.findOne({ tenantId });
        if (!subscription || !subscription.stripeCustomerId) {
            throw new Error('No active Stripe customer account found for this tenant.');
        }

        const domain = process.env.FRONTEND_DOMAIN || process.env.UI_LINK || 'http://localhost:5173';
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: subscription.stripeCustomerId,
            return_url: `${domain}/dashboard/billing`
        });

        return { url: portalSession.url };
    }

    static async getSubscriptionStatus(tenantId) {
        const subscription = await Subscription.findOne({ tenantId }).lean();
        if (!subscription) {
            return {
                status: 'inactive',
                plan: 'free'
            };
        }
        return subscription;
    }

    static async handleWebhookEvent(rawBody, signature) {
        const stripe = this.getStripe();
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        let event;
        try {
            if (webhookSecret && signature) {
                event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
            } else {
                event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
            }
        } catch (err) {
            throw new Error(`Webhook signature verification failed: ${err.message}`);
        }

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const tenantId = session.metadata?.tenantId;
                if (tenantId && session.subscription) {
                    const subData = await stripe.subscriptions.retrieve(session.subscription);
                    await Subscription.findOneAndUpdate(
                        { tenantId },
                        {
                            tenantId,
                            stripeCustomerId: session.customer,
                            stripeSubscriptionId: subData.id,
                            status: subData.status,
                            plan: subData.items.data[0]?.price.id || 'pro',
                            currentPeriodStart: new Date(subData.current_period_start * 1000),
                            currentPeriodEnd: new Date(subData.current_period_end * 1000)
                        },
                        { upsert: true, new: true }
                    );
                }
                break;
            }

            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const customerId = sub.customer;
                const subscription = await Subscription.findOne({ stripeCustomerId: customerId });
                if (subscription) {
                    subscription.stripeSubscriptionId = sub.id;
                    subscription.status = sub.status;
                    subscription.plan = sub.items.data[0]?.price.id || subscription.plan;
                    subscription.currentPeriodStart = new Date(sub.current_period_start * 1000);
                    subscription.currentPeriodEnd = new Date(sub.current_period_end * 1000);
                    await subscription.save();
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                const customerId = sub.customer;
                await Subscription.findOneAndUpdate(
                    { stripeCustomerId: customerId },
                    { status: 'canceled' }
                );
                break;
            }

            case 'invoice.paid': {
                const invoice = event.data.object;
                if (invoice.subscription) {
                    await Subscription.findOneAndUpdate(
                        { stripeSubscriptionId: invoice.subscription },
                        { status: 'active' }
                    );
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                if (invoice.subscription) {
                    await Subscription.findOneAndUpdate(
                        { stripeSubscriptionId: invoice.subscription },
                        { status: 'past_due' }
                    );
                }
                break;
            }

            default:
                console.log(`Unhandled Stripe webhook event: ${event.type}`);
        }

        return { received: true };
    }
}

module.exports = StripeService;
