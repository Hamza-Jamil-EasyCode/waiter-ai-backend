const express = require('express');
const router = express.Router();
const UploadController = require('../controllers/upload.controller');
const uploadMiddleware = require('../middleware/upload.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { requireTenant } = require('../middleware/tenant.middleware');

router.use(authenticate, requireTenant);

router.post('/image', uploadMiddleware.single('image'), UploadController.uploadImage);
router.post('/import-catalog', uploadMiddleware.single('file'), UploadController.importCatalog);

module.exports = router;
