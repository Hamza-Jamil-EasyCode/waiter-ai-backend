const ItemService = require('../services/catalog/item.service');

class ItemController {
    static async createItem(req, res, next) {
        try {
            const item = await ItemService.createItem(req.tenantId, req.params.catalogId, req.body);
            res.status(201).json({ success: true, data: item });
        } catch (err) {
            next(err);
        }
    }

    static async getItems(req, res, next) {
        try {
            const result = await ItemService.getItems(req.tenantId, req.params.catalogId, req.query);
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    static async getItemById(req, res, next) {
        try {
            const item = await ItemService.getItemById(req.tenantId, req.params.id);
            res.status(200).json({ success: true, data: item });
        } catch (err) {
            next(err);
        }
    }

    static async updateItem(req, res, next) {
        try {
            const item = await ItemService.updateItem(req.tenantId, req.params.id, req.body);
            res.status(200).json({ success: true, data: item });
        } catch (err) {
            next(err);
        }
    }

    static async deleteItem(req, res, next) {
        try {
            await ItemService.deleteItem(req.tenantId, req.params.id);
            res.status(200).json({ success: true, message: 'Catalog item deleted' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = ItemController;
