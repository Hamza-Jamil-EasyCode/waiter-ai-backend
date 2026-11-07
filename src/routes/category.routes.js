const express = require('express');
const router = express.Router({ mergeParams: true });
const CategoryController = require('../controllers/category.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireTenant } = require('../middleware/tenant.middleware');

// Sub-resource endpoints: /api/catalogs/:catalogId/categories
router.post('/catalogs/:catalogId/categories', authenticate, requireTenant, CategoryController.createCategory);
router.get('/catalogs/:catalogId/categories', authenticate, requireTenant, CategoryController.getCategories);
router.put('/catalogs/:catalogId/categories/reorder', authenticate, requireTenant, CategoryController.reorderCategories);

// Direct resource endpoints: /api/categories/:id
router.patch('/categories/:id', authenticate, requireTenant, CategoryController.updateCategory);
router.delete('/categories/:id', authenticate, requireTenant, CategoryController.deleteCategory);

module.exports = router;
