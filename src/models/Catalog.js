const mongoose = require('mongoose');

const catalogSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            default: ''
        },
        language: {
            type: String,
            default: 'en'
        },
        status: {
            type: String,
            enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
            default: 'DRAFT'
        },
        version: {
            type: Number,
            default: 1
        }
    },
    { timestamps: true }
);

catalogSchema.index({ tenantId: 1, status: 1 });

module.exports = mongoose.model('Catalog', catalogSchema);
