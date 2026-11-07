const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireTenant } = require('../middleware/tenant.middleware');

router.use(authenticate, requireTenant);

router.get('/overview', AnalyticsController.getOverview);
router.get('/items', AnalyticsController.getItems);
router.get('/questions', AnalyticsController.getQuestions);
router.get('/unanswered', AnalyticsController.getUnanswered);

module.exports = router;
