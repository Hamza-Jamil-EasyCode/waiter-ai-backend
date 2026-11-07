const TenantService = require('../services/catalog/tenant.service');
const CostService = require('../services/ai/cost.service');

class AdminController {
    static async listTenants(req, res, next) {
        try {
            const result = await TenantService.listTenants(req.query);
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    static async updateTenantStatus(req, res, next) {
        try {
            const { status } = req.body;
            if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
                return res.status(400).json({ success: false, message: "Status must be 'ACTIVE' or 'SUSPENDED'." });
            }

            const tenant = await TenantService.updateTenant(req.params.id, { status });
            res.status(200).json({ success: true, message: `Tenant status updated to ${status}`, data: tenant });
        } catch (err) {
            next(err);
        }
    }

    static async getAICostReport(req, res, next) {
        try {
            const { tenantId, startDate, endDate } = req.query;
            const report = await CostService.getTenantCostSummary(tenantId, startDate, endDate);
            res.status(200).json({ success: true, data: report });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = AdminController;
