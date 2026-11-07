const express = require('express');
const router = express.Router();
const SubscriptionController = require('../controllers/subscription.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireTenant } = require('../middleware/tenant.middleware');

// Public Stripe Webhook route (raw body parsing handled by Express or text middleware)
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), SubscriptionController.handleStripeWebhook);

// Authenticated tenant subscription routes
router.post('/checkout', authenticate, requireTenant, SubscriptionController.createCheckoutSession);
router.post('/portal', authenticate, requireTenant, SubscriptionController.createPortalSession);
router.get('/current', authenticate, requireTenant, SubscriptionController.getCurrentSubscription);

module.exports = router;
