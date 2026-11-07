const mongoose = require('mongoose');

const catalogItemSchema = new mongoose.Schema(
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
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
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
        price: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            default: 'USD',
            uppercase: true,
            trim: true
        },
        image: {
            type: String,
            default: ''
        },
        tags: [
            {
                type: String,
                trim: true,
                lowercase: true // so tag filters/matches are predictable
            }
        ],
        attributes: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        ingredients: [
            {
                type: String,
                trim: true,
                lowercase: true
            }
        ],

        // CHANGE 2: select: false.
        // 1536 floats per doc. Without this, every plain .find() drags ~12KB
        // per item over the wire for no reason. Paths that genuinely need it
        // (the in-memory cosine fallback, the re-index job) request it
        // explicitly, which overrides select:false.
        embedding: {
            type: [Number],
            default: [],
            select: false
        },

        embeddingModel: {
            type: String,
            default: 'text-embedding-3-small'
        },
        embeddingVersion: {
            type: Number,
            default: 0 // 0 = never embedded; see EMBEDDING_VERSION above
        },

        // CHANGE 3: staleness tracking.
        // Hash of the exact text that produced the current embedding. Lets the
        // re-index job skip items whose content genuinely hasn't changed,
        // instead of re-embedding the whole catalog on every run.
        embeddingHash: {
            type: String,
            default: '',
            select: false
        },
        embeddedAt: {
            type: Date,
            default: null
        },

        isAvailable: {
            type: Boolean,
            default: true
        },
        sortOrder: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

/* ------------------------------------------------------------------ *
 * CHANGE 4: indexes
 * ------------------------------------------------------------------ */

// Covers the structured/browse path: tenant + catalog + availability, sorted by price.
catalogItemSchema.index({ tenantId: 1, catalogId: 1, isAvailable: 1, price: 1 });

// Covers category-scoped browsing.
catalogItemSchema.index({ tenantId: 1, categoryId: 1, isAvailable: 1, price: 1 });

// Lets the re-index job find stale docs cheaply.
catalogItemSchema.index({ tenantId: 1, embeddingVersion: 1 });

// Keyword arm of the hybrid search. Weighted so a name match beats a
// description match. NOTE: MongoDB allows only ONE text index per collection.
catalogItemSchema.index(
    { name: 'text', description: 'text', tags: 'text', ingredients: 'text' },
    {
        name: 'catalog_item_text',
        weights: { name: 10, tags: 5, ingredients: 3, description: 1 },
        default_language: 'english'
    }
);

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

// Mixed paths don't auto-detect mutation. Without this, item.attributes.foo = 'x'
// followed by save() silently persists nothing.
catalogItemSchema.pre('save', function (next) {
    if (this.isModified('attributes')) this.markModified('attributes');
    next();
});

module.exports = mongoose.model('CatalogItem', catalogItemSchema);