const mongoose = require('mongoose');
const AnalyticsEvent = require('../../models/AnalyticsEvent');
const Question = require('../../models/Question');
const CatalogItem = require('../../models/CatalogItem');

class AnalyticsService {
    static async getOverview(tenantId, startDate, endDate) {
        const match = { tenantId: new mongoose.Types.ObjectId(tenantId) };
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate);
            if (endDate) match.createdAt.$lte = new Date(endDate);
        }

        const [eventCounts, questionStats] = await Promise.all([
            AnalyticsEvent.aggregate([
                { $match: match },
                { $group: { _id: '$eventType', count: { $sum: 1 } } }
            ]),
            Question.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: null,
                        totalQuestions: { $sum: 1 },
                        answeredCount: {
                            $sum: { $cond: [{ $eq: ['$answered', true] }, 1, 0] }
                        },
                        unansweredCount: {
                            $sum: { $cond: [{ $eq: ['$answered', false] }, 1, 0] }
                        }
                    }
                }
            ])
        ]);

        const eventsMap = {};
        eventCounts.forEach((e) => {
            eventsMap[e._id] = e.count;
        });

        const qStats = questionStats[0] || { totalQuestions: 0, answeredCount: 0, unansweredCount: 0 };

        return {
            totalCatalogViews: eventsMap.CATALOG_VIEW || 0,
            totalItemViews: eventsMap.ITEM_VIEW || 0,
            totalQuestions: qStats.totalQuestions,
            answeredQuestions: qStats.answeredCount,
            unansweredQuestions: qStats.unansweredCount,
            answeredRate: qStats.totalQuestions > 0 ? (qStats.answeredCount / qStats.totalQuestions) * 100 : 100
        };
    }

    static async getTopItems(tenantId, limit = 10) {
        const itemViews = await AnalyticsEvent.aggregate([
            {
                $match: {
                    tenantId: new mongoose.Types.ObjectId(tenantId),
                    eventType: 'ITEM_VIEW',
                    itemId: { $ne: null }
                }
            },
            { $group: { _id: '$itemId', views: { $sum: 1 } } },
            { $sort: { views: -1 } },
            { $limit: Number(limit) }
        ]);

        const itemIds = itemViews.map((iv) => iv._id);
        const items = await CatalogItem.find({ _id: { $in: itemIds }, tenantId }).lean();
        const itemMap = new Map(items.map((i) => [i._id.toString(), i]));

        return itemViews.map((iv) => ({
            item: itemMap.get(iv._id.toString()) || { _id: iv._id, name: 'Deleted Item' },
            views: iv.views
        }));
    }

    static async getQuestionAnalytics(tenantId, { page = 1, limit = 20, answered }) {
        const filter = { tenantId };
        if (answered !== undefined) {
            filter.answered = answered === 'true' || answered === true;
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [questions, total] = await Promise.all([
            Question.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
            Question.countDocuments(filter)
        ]);

        return {
            questions,
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit))
        };
    }

    static async getUnansweredQuestions(tenantId, limit = 20) {
        const questions = await Question.find({
            tenantId,
            answered: false
        })
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .lean();

        // Cluster frequency of unanswered questions
        const frequencyMap = new Map();
        questions.forEach((q) => {
            const normalized = q.question.toLowerCase().trim();
            const existing = frequencyMap.get(normalized) || { question: q.question, count: 0, lastAsked: q.createdAt };
            existing.count += 1;
            frequencyMap.set(normalized, existing);
        });

        const topUnmetDemand = Array.from(frequencyMap.values()).sort((a, b) => b.count - a.count);

        return {
            unansweredQuestions: questions,
            topUnmetDemand
        };
    }
}

module.exports = AnalyticsService;
