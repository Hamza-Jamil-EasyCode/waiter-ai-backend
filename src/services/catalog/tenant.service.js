const Tenant = require('../../models/Tenant');
const AICostLog = require('../../models/AICostLog');

class TenantService {
    static async createTenant(data) {
        const slug = data.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
        const existing = await Tenant.findOne({ slug });
        if (existing) {
            throw new Error(`Tenant slug '${slug}' is already in use.`);
        }
        return await Tenant.create({ ...data, slug });
    }

    static async getTenantById(id) {
        const tenant = await Tenant.findById(id).lean();
        if (!tenant) throw new Error('Tenant not found');
        return tenant;
    }

    static async getTenantBySlug(slug) {
        const tenant = await Tenant.findOne({ slug: slug.toLowerCase() }).lean();
        if (!tenant) throw new Error(`Tenant '${slug}' not found`);
        return tenant;
    }

    static async updateTenant(id, updateData) {
        if (updateData.slug) {
            updateData.slug = updateData.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
            const existing = await Tenant.findOne({ slug: updateData.slug, _id: { $ne: id } });
            if (existing) {
                throw new Error(`Tenant slug '${updateData.slug}' is already taken.`);
            }
        }
        const tenant = await Tenant.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true });
        if (!tenant) throw new Error('Tenant not found');
        return tenant;
    }

    static async updateBranding(id, brandingData) {
        const allowed = {};
        if (brandingData.logo !== undefined) allowed.logo = brandingData.logo;
        if (brandingData.primaryColor) allowed.primaryColor = brandingData.primaryColor;
        if (brandingData.secondaryColor) allowed.secondaryColor = brandingData.secondaryColor;
        if (brandingData.defaultLanguage) allowed.defaultLanguage = brandingData.defaultLanguage;

        return await Tenant.findByIdAndUpdate(id, { $set: allowed }, { new: true });
    }

    static async listTenants({ page = 1, limit = 20, status, search }) {
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 20;
        const query = {};
        if (status && status !== 'undefined') query.status = status;
        if (search && search.trim() && search !== 'undefined') {
            query.$or = [
                { name: { $regex: search.trim(), $options: 'i' } },
                { slug: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        const skip = (pageNum - 1) * limitNum;
        const [tenants, total] = await Promise.all([
            Tenant.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
            Tenant.countDocuments(query)
        ]);

        const tenantIds = tenants.map((t) => t._id);
        const costLogs = await AICostLog.aggregate([
            { $match: { tenantId: { $in: tenantIds } } },
            { $group: { _id: '$tenantId', totalCost: { $sum: '$estimatedCost' } } }
        ]);

        const costMap = new Map(costLogs.map((item) => [item._id ? item._id.toString() : '', item.totalCost]));
        const tenantsWithCost = tenants.map((t) => ({
            ...t,
            aiCost: costMap.get(t._id.toString()) || 0
        }));

        return {
            tenants: tenantsWithCost,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum) || 1
        };
    }
}

module.exports = TenantService;
