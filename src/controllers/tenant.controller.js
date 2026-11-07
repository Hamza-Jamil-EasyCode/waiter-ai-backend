const TenantService = require('../services/catalog/tenant.service');

class TenantController {
    static async createTenant(req, res, next) {
        try {
            const tenant = await TenantService.createTenant(req.body);
            res.status(201).json({ success: true, data: tenant });
        } catch (err) {
            next(err);
        }
    }

    static async getMyTenant(req, res, next) {
        try {
            console.log(req.tenantId)
            const tenant = await TenantService.getTenantById(req.tenantId);
            res.status(200).json({ success: true, data: tenant });
        } catch (err) {
            next(err);
        }
    }

    static async getTenantById(req, res, next) {
        try {
            const tenant = await TenantService.getTenantById(req.params.id);
            res.status(200).json({ success: true, data: tenant });
        } catch (err) {
            next(err);
        }
    }

    static async updateMyTenant(req, res, next) {
        try {
            const tenant = await TenantService.updateTenant(req.tenantId, req.body);
            res.status(200).json({ success: true, data: tenant });
        } catch (err) {
            next(err);
        }
    }

    static async updateBranding(req, res, next) {
        try {
            const tenant = await TenantService.updateBranding(req.tenantId, req.body);
            res.status(200).json({ success: true, data: tenant });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = TenantController;
