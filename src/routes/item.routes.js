const express = require('express');
const router = express.Router({ mergeParams: true });
const ItemController = require('../controllers/item.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireTenant } = require('../middleware/tenant.middleware');

// Sub-resource endpoints: /api/catalogs/:catalogId/items
router.post('/catalogs/:catalogId/items', authenticate, requireTenant, ItemController.createItem);
router.get('/catalogs/:catalogId/items', authenticate, requireTenant, ItemController.getItems);

// Direct resource endpoints: /api/items/:id
router.get('/items/:id', authenticate, requireTenant, ItemController.getItemById);
router.patch('/items/:id', authenticate, requireTenant, ItemController.updateItem);
router.delete('/items/:id', authenticate, requireTenant, ItemController.deleteItem);

module.exports = router;
