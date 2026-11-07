const Tenant = require('../models/Tenant');

const requireTenant = async (req, res, next) => {
    try {
        if (req.user && req.user.role === 'SUPER_ADMIN') {
            const headerTenantId = req.headers['x-tenant-id'];
            if (headerTenantId) {
                req.tenantId = headerTenantId;
            } else if (req.user.tenantId) {
                req.tenantId = req.user.tenantId;
            } else {
                req.tenantId = null;
            }
            return next();
        }

        if (!req.user || !req.user.tenantId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. User is not associated with any tenant.'
            });
        }

        req.tenantId = req.user.tenantId;
        next();
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to process tenant context.', error: err.message });
    }
};

const resolvePublicTenant = async (req, res, next) => {
    try {
        const { slug } = req.params;
        if (!slug) {
            return res.status(400).json({ success: false, message: 'Tenant catalog slug is required.' });
        }

        const tenant = await Tenant.findOne({ slug: slug.toLowerCase().trim() }).lean();
        if (!tenant) {
            return res.status(404).json({ success: false, message: `Tenant catalog '${slug}' not found.` });
        }

        if (tenant.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'This catalog is currently suspended or inactive.' });
        }

        req.tenant = tenant;
        req.tenantId = tenant._id.toString();
        next();
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to resolve public tenant.', error: err.message });
    }
};

module.exports = {
    requireTenant,
    resolvePublicTenant
};
