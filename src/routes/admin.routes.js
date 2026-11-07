const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate, authorize('SUPER_ADMIN'));

router.get('/tenants', AdminController.listTenants);
router.patch('/tenants/:id/status', AdminController.updateTenantStatus);
router.get('/ai-costs', AdminController.getAICostReport);

module.exports = router;
