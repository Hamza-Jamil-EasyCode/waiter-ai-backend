const mongoose = require('mongoose');
const AICostLog = require('../../models/AICostLog');
const Tenant = require('../../models/Tenant');

// Estimated costs per 1,000 tokens (USD)
const PRICING = {
    'text-embedding-3-small': { input: 0.00002, output: 0.0 },
    'text-embedding-3-large': { input: 0.00013, output: 0.0 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0.0025, output: 0.01 }
};

class CostService {
    static async logUsage({ tenantId, model, operation, inputTokens = 0, outputTokens = 0 }) {
        try {
            const modelPricing = PRICING[model] || PRICING['gpt-4o-mini'];
            const estimatedCost =
                (inputTokens / 1000) * modelPricing.input + (outputTokens / 1000) * modelPricing.output;

            await AICostLog.create({
                tenantId: tenantId ? (mongoose.Types.ObjectId.isValid(tenantId) ? new mongoose.Types.ObjectId(tenantId) : tenantId) : null,
                model,
                operation,
                inputTokens,
                outputTokens,
                estimatedCost
            });
        } catch (err) {
            console.error('Failed to log AI cost usage:', err.message);
        }
    }

    static async getTenantCostSummary(tenantId, startDate, endDate) {
        const match = {};
        if (tenantId) {
            match.tenantId = mongoose.Types.ObjectId.isValid(tenantId)
                ? new mongoose.Types.ObjectId(tenantId)
                : tenantId;
        }
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate);
            if (endDate) match.createdAt.$lte = new Date(endDate);
        }

        // 1. Overall operations summary
        const operationsSummary = await AICostLog.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$operation',
                    totalInputTokens: { $sum: '$inputTokens' },
                    totalOutputTokens: { $sum: '$outputTokens' },
                    totalCost: { $sum: '$estimatedCost' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // 2. Per tenant aggregation
        const tenantLogs = await AICostLog.aggregate([
            { $match: match },
            {
                $group: {
                    _id: {
                        tenantId: '$tenantId',
                        operation: '$operation'
                    },
                    inputTokens: { $sum: '$inputTokens' },
                    outputTokens: { $sum: '$outputTokens' },
                    cost: { $sum: '$estimatedCost' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Fetch all tenants to ensure complete coverage (even zero usage tenants)
        const allTenants = await Tenant.find().select('name slug status logo').lean();
        const tenantMap = new Map();

        // Initialize tenant map entries for all existing tenants
        for (const t of allTenants) {
            tenantMap.set(t._id.toString(), {
                tenantId: t._id.toString(),
                tenantName: t.name,
                tenantSlug: t.slug,
                status: t.status,
                logo: t.logo,
                totalCost: 0,
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalCalls: 0,
                operations: []
            });
        }

        // Process aggregated logs and populate tenantMap
        for (const item of tenantLogs) {
            const rawTenantId = item._id.tenantId ? item._id.tenantId.toString() : 'system';
            if (!tenantMap.has(rawTenantId)) {
                if (rawTenantId === 'system') {
                    tenantMap.set('system', {
                        tenantId: 'system',
                        tenantName: 'System / Platform Global',
                        tenantSlug: 'system',
                        status: 'ACTIVE',
                        logo: '',
                        totalCost: 0,
                        totalInputTokens: 0,
                        totalOutputTokens: 0,
                        totalCalls: 0,
                        operations: []
                    });
                } else {
                    tenantMap.set(rawTenantId, {
                        tenantId: rawTenantId,
                        tenantName: 'Unknown Tenant',
                        tenantSlug: 'unknown',
                        status: 'UNKNOWN',
                        logo: '',
                        totalCost: 0,
                        totalInputTokens: 0,
                        totalOutputTokens: 0,
                        totalCalls: 0,
                        operations: []
                    });
                }
            }

            const entry = tenantMap.get(rawTenantId);
            entry.totalCost += item.cost;
            entry.totalInputTokens += item.inputTokens;
            entry.totalOutputTokens += item.outputTokens;
            entry.totalCalls += item.count;
            entry.operations.push({
                operation: item._id.operation,
                inputTokens: item.inputTokens,
                outputTokens: item.outputTokens,
                cost: item.cost,
                count: item.count
            });
        }

        // If a specific tenantId was requested, filter tenantMap to only that tenant (or system)
        let tenantsList = Array.from(tenantMap.values());
        if (tenantId) {
            const targetId = tenantId.toString();
            tenantsList = tenantsList.filter((t) => t.tenantId === targetId);
        }

        // Sort tenants by totalCost descending
        tenantsList.sort((a, b) => b.totalCost - a.totalCost);

        const totalCostAll = operationsSummary.reduce((acc, curr) => acc + curr.totalCost, 0);
        const totalInputTokensAll = operationsSummary.reduce((acc, curr) => acc + curr.totalInputTokens, 0);
        const totalOutputTokensAll = operationsSummary.reduce((acc, curr) => acc + curr.totalOutputTokens, 0);
        const totalCallsAll = operationsSummary.reduce((acc, curr) => acc + curr.count, 0);

        return {
            totalEstimatedCost: totalCostAll,
            totalInputTokens: totalInputTokensAll,
            totalOutputTokens: totalOutputTokensAll,
            totalCalls: totalCallsAll,
            operations: operationsSummary,
            tenants: tenantsList
        };
    }
}

module.exports = CostService;
