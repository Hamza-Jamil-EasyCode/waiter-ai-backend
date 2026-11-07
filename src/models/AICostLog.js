const mongoose = require('mongoose');

const aiCostLogSchema = new mongoose.Schema({
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tenant',
        default: null,
        index: true
    },
    model: {
        type: String,
        required: true
    },
    operation: {
        type: String,
        enum: ['EMBEDDING', 'CHAT', 'TRANSLATION', 'MENU_IMPORT'],
        required: true
    },
    inputTokens: {
        type: Number,
        default: 0
    },
    outputTokens: {
        type: Number,
        default: 0
    },
    estimatedCost: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

aiCostLogSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model('AICostLog', aiCostLogSchema);
