const StripeService = require('../services/stripe/stripe.service');

class SubscriptionController {
    static async createCheckoutSession(req, res, next) {
        try {
            const { priceId } = req.body;
            const result = await StripeService.createCheckoutSession(req.tenantId, priceId);
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    static async createPortalSession(req, res, next) {
        try {
            const result = await StripeService.createCustomerPortalSession(req.tenantId);
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    static async getCurrentSubscription(req, res, next) {
        try {
            const subscription = await StripeService.getSubscriptionStatus(req.tenantId);
            res.status(200).json({ success: true, data: subscription });
        } catch (err) {
            next(err);
        }
    }

    static async handleStripeWebhook(req, res, next) {
        try {
            const signature = req.headers['stripe-signature'];
            // rawBody is attached by express.text or raw middleware
            const rawBody = req.body;
            const result = await StripeService.handleWebhookEvent(rawBody, signature);
            res.status(200).json(result);
        } catch (err) {
            res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }
}

module.exports = SubscriptionController;
