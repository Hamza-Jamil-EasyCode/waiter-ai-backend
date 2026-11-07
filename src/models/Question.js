const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            index: true
        },
        catalogId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Catalog',
            required: true,
            index: true
        },
        sessionId: {
            type: String,
            required: true,
            index: true
        },
        question: {
            type: String,
            required: true
        },
        answered: {
            type: Boolean,
            required: true,
            index: true
        },
        answer: {
            type: String,
            default: ''
        },
        retrievedItemIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'CatalogItem'
            }
        ],
        confidence: {
            type: Number,
            default: 0
        },
        reason: {
            type: String,
            default: 'ANSWERED'
        }
    },
    { timestamps: true }
);

questionSchema.index({ tenantId: 1, createdAt: -1 });
questionSchema.index({ tenantId: 1, answered: 1 });

module.exports = mongoose.model('Question', questionSchema);
