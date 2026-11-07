const express = require('express');
const router = express.Router();
const PublicController = require('../controllers/public.controller');
const { resolvePublicTenant } = require('../middleware/tenant.middleware');

router.get('/catalog/:slug', resolvePublicTenant, PublicController.getPublicCatalog);

module.exports = router;
