const express = require('express');
const router = express.Router();
const TenantController = require('../controllers/tenant.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { requireTenant } = require('../middleware/tenant.middleware');

router.use(authenticate);

// Super admin creates tenant manually if needed
router.post('/', authorize('SUPER_ADMIN'), TenantController.createTenant);

// Tenant admin accesses own tenant
router.get('/my', requireTenant, TenantController.getMyTenant);
router.patch('/my', requireTenant, TenantController.updateMyTenant);
router.patch('/my/branding', requireTenant, TenantController.updateBranding);

// Admin get by ID
router.get('/:id', authorize('SUPER_ADMIN'), TenantController.getTenantById);

module.exports = router;
