const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
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
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            default: ''
        },
        sortOrder: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

categorySchema.index({ tenantId: 1, catalogId: 1, sortOrder: 1 });

module.exports = mongoose.model('Category', categorySchema);
