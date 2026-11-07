const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        required: true,
        index: true
    },
    catalogId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Catalog',
        default: null
    },
    sessionId: {
        type: String,
        default: ''
    },
    eventType: {
        type: String,
        enum: [
            'CATALOG_VIEW',
            'ITEM_VIEW',
            'SEARCH',
            'QUESTION_ASKED',
            'QUESTION_ANSWERED',
            'QUESTION_UNANSWERED',
            'LANGUAGE_CHANGED'
        ],
        required: true,
        index: true
    },
    itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CatalogItem',
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

analyticsEventSchema.index({ tenantId: 1, createdAt: -1 });
analyticsEventSchema.index({ tenantId: 1, eventType: 1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
