const CategoryService = require('../services/catalog/category.service');

class CategoryController {
    static async createCategory(req, res, next) {
        try {
            const category = await CategoryService.createCategory(req.tenantId, req.params.catalogId, req.body);
            res.status(201).json({ success: true, data: category });
        } catch (err) {
            next(err);
        }
    }

    static async getCategories(req, res, next) {
        try {
            const categories = await CategoryService.getCategories(req.tenantId, req.params.catalogId);
            res.status(200).json({ success: true, data: categories });
        } catch (err) {
            next(err);
        }
    }

    static async reorderCategories(req, res, next) {
        try {
            const { orderedCategoryIds } = req.body;
            const categories = await CategoryService.reorderCategories(
                req.tenantId,
                req.params.catalogId,
                orderedCategoryIds
            );
            res.status(200).json({ success: true, data: categories });
        } catch (err) {
            next(err);
        }
    }

    static async updateCategory(req, res, next) {
        try {
            const category = await CategoryService.updateCategory(req.tenantId, req.params.id, req.body);
            res.status(200).json({ success: true, data: category });
        } catch (err) {
            next(err);
        }
    }

    static async deleteCategory(req, res, next) {
        try {
            await CategoryService.deleteCategory(req.tenantId, req.params.id);
            res.status(200).json({ success: true, message: 'Category deleted' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = CategoryController;
