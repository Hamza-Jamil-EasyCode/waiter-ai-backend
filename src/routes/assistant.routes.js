const express = require('express');
const router = express.Router();
const AssistantController = require('../controllers/assistant.controller');
const { resolvePublicTenant } = require('../middleware/tenant.middleware');
const { publicAskLimiter } = require('../middleware/rateLimiter.middleware');

router.post('/catalog/:slug/ask', publicAskLimiter, resolvePublicTenant, AssistantController.askQuestion);

module.exports = router;
