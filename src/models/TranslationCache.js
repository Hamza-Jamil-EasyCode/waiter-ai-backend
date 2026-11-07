const mongoose = require('mongoose');

const translationCacheSchema = new mongoose.Schema(
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
        sourceLanguage: {
            type: String,
            required: true
        },
        targetLanguage: {
            type: String,
            required: true
        },
        contentHash: {
            type: String,
            required: true
        },
        translatedContent: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        }
    },
    { timestamps: true }
);

translationCacheSchema.index({ tenantId: 1, catalogId: 1, targetLanguage: 1, contentHash: 1 });

module.exports = mongoose.model('TranslationCache', translationCacheSchema);
