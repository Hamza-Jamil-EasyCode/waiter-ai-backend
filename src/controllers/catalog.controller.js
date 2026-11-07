const CatalogService = require('../services/catalog/catalog.service');

class CatalogController {
    static async createCatalog(req, res, next) {
        try {
            const catalog = await CatalogService.createCatalog(req.tenantId, req.body);
            res.status(201).json({ success: true, data: catalog });
        } catch (err) {
            next(err);
        }
    }

    static async getCatalogs(req, res, next) {
        try {
            const catalogs = await CatalogService.getCatalogs(req.tenantId);
            res.status(200).json({ success: true, data: catalogs });
        } catch (err) {
            next(err);
        }
    }

    static async getCatalogById(req, res, next) {
        try {
            const catalog = await CatalogService.getCatalogById(req.tenantId, req.params.id);
            res.status(200).json({ success: true, data: catalog });
        } catch (err) {
            next(err);
        }
    }

    static async updateCatalog(req, res, next) {
        try {
            const catalog = await CatalogService.updateCatalog(req.tenantId, req.params.id, req.body);
            res.status(200).json({ success: true, data: catalog });
        } catch (err) {
            next(err);
        }
    }

    static async deleteCatalog(req, res, next) {
        try {
            await CatalogService.deleteCatalog(req.tenantId, req.params.id);
            res.status(200).json({ success: true, message: 'Catalog deleted successfully' });
        } catch (err) {
            next(err);
        }
    }

    static async publishCatalog(req, res, next) {
        try {
            const { unpublishOthers, force } = req.body || {};
            const catalog = await CatalogService.publishCatalog(req.tenantId, req.params.id, { unpublishOthers, force });
            res.status(200).json({ success: true, message: 'Catalog published and embeddings regenerated.', data: catalog });
        } catch (err) {
            if (err.code === 'ALREADY_PUBLISHED') {
                return res.status(409).json({
                    success: false,
                    code: 'ALREADY_PUBLISHED',
                    message: err.message,
                    existingMenu: err.existingMenu
                });
            }
            next(err);
        }
    }

    static async unpublishCatalog(req, res, next) {
        try {
            const catalog = await CatalogService.unpublishCatalog(req.tenantId, req.params.id);
            res.status(200).json({ success: true, message: 'Catalog unpublished', data: catalog });
        } catch (err) {
            next(err);
        }
    }

    static async getQRCode(req, res, next) {
        try {
            const format = req.query.format || 'dataUrl';
            const result = await CatalogService.generateQRCode(req.tenantId, req.params.id, format);

            if (format === 'svg') {
                res.type('svg').send(result);
            } else if (format === 'png') {
                res.type('png').send(result);
            } else {
                res.status(200).json({ success: true, qrDataUrl: result });
            }
        } catch (err) {
            next(err);
        }
    }
}

module.exports = CatalogController;
