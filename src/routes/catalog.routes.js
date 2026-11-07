const express = require('express');
const router = express.Router();
const CatalogController = require('../controllers/catalog.controller');
const ImportController = require('../controllers/import.controller');
const uploadMiddleware = require('../middleware/upload.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { requireTenant } = require('../middleware/tenant.middleware');

router.use(authenticate, requireTenant);

// Import Menu Endpoints
router.post('/import/link', ImportController.importFromLink);
router.post('/import/pdf', uploadMiddleware.single('file'), ImportController.importFromPdf);
router.post('/import/photos', uploadMiddleware.array('photos', 10), ImportController.importFromPhotos);
router.post('/import/spreadsheet', uploadMiddleware.single('file'), ImportController.importFromSpreadsheet);
router.post('/import/save', ImportController.saveImportedMenu);

// Catalog CRUD & Actions
router.post('/', CatalogController.createCatalog);
router.get('/', CatalogController.getCatalogs);
router.get('/:id', CatalogController.getCatalogById);
router.patch('/:id', CatalogController.updateCatalog);
router.delete('/:id', CatalogController.deleteCatalog);

router.post('/:id/publish', CatalogController.publishCatalog);
router.post('/:id/unpublish', CatalogController.unpublishCatalog);
router.get('/:id/qr', CatalogController.getQRCode);

module.exports = router;
