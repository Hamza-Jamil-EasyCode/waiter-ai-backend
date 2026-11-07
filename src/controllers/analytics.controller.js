const AnalyticsService = require('../services/analytics/analytics.service');

class AnalyticsController {
    static async getOverview(req, res, next) {
        try {
            const { startDate, endDate } = req.query;
            const overview = await AnalyticsService.getOverview(req.tenantId, startDate, endDate);
            res.status(200).json({ success: true, data: overview });
        } catch (err) {
            next(err);
        }
    }

    static async getItems(req, res, next) {
        try {
            const limit = req.query.limit || 10;
            const topItems = await AnalyticsService.getTopItems(req.tenantId, limit);
            res.status(200).json({ success: true, data: topItems });
        } catch (err) {
            next(err);
        }
    }

    static async getQuestions(req, res, next) {
        try {
            const result = await AnalyticsService.getQuestionAnalytics(req.tenantId, req.query);
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    static async getUnanswered(req, res, next) {
        try {
            const limit = req.query.limit || 20;
            const result = await AnalyticsService.getUnansweredQuestions(req.tenantId, limit);
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = AnalyticsController;
