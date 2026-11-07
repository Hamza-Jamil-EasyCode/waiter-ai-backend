const crypto = require('crypto');
const OpenAI = require('openai');
const CostService = require('./cost.service');

// Bump whenever buildItemEmbeddingText changes shape — drives re-indexing.
const EMBEDDING_VERSION = 4;

const PRICE_TIERS = [
    { max: 8, label: 'budget-friendly, cheap, inexpensive, value' },
    { max: 18, label: 'mid-range, moderately priced' },
    { max: 35, label: 'premium, upscale' },
    { max: Infinity, label: 'luxury, high-end, expensive, splurge' }
];

// Attributes whose raw values are numeric noise for an embedding — bucketed into
// words instead, or dropped. Digits carry no ordering information to a text
// embedding, so leaving them raw actively hurts price/quantity-style queries.
const NUMERIC_ATTRIBUTES = new Set(['calories', 'preptime', 'prep_time', 'weight', 'volume', 'servings']);
const SKIPPED_ATTRIBUTES = new Set(['sku', 'barcode', 'internalcode', 'position', 'foodcost', 'food_cost', 'foodcostpercentage']);

const DIETARY_SYNONYMS = {
    vegan: 'vegan, 100% plant-based, no animal products',
    vegetarian: 'vegetarian friendly, meat-free',
    'gluten-free': 'gluten-free, no gluten, celiac safe, wheat free',
    halal: 'halal certified, halal friendly, no pork, no alcohol',
    kosher: 'kosher friendly, kosher certified',
    spicy: 'spicy, hot, chili pepper',
    'high-protein': 'high-protein, protein rich, fitness friendly',
    keto: 'keto friendly, ketogenic, low carb',
    'dairy-free': 'dairy-free, no milk, lactose free',
    'nut-free': 'nut-free, no nuts, allergy safe for nut allergies'
};

function asEntries(attributes) {
    if (!attributes) return [];
    if (attributes instanceof Map) return Array.from(attributes.entries());
    if (typeof attributes !== 'object') return [];
    return Object.entries(attributes);
}

function normaliseKey(key) {
    return String(key)
        .toLowerCase()
        .replace(/[\s_-]/g, '');
}

function describeNumericAttribute(key, value) {
    const n = parseFloat(String(value).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n)) return null;

    switch (normaliseKey(key)) {
        case 'calories':
            if (n <= 250) return 'light, low calorie';
            if (n <= 600) return 'moderate portion';
            return 'hearty, filling, indulgent';
        case 'preptime':
            if (n <= 10) return 'quick, fast to prepare, ready fast';
            if (n <= 25) return null; // unremarkable — say nothing
            return 'slow-cooked, takes time to prepare';
        case 'servings':
            if (n >= 3) return 'shareable, good for a group';
            return null;
        default:
            return null;
    }
}

function priceTier(price) {
    if (typeof price !== 'number' || !Number.isFinite(price)) return null;
    return PRICE_TIERS.find((t) => price <= t.max).label;
}

class EmbeddingService {
    /**
     * Client is expensive-ish to construct and stateless once built — cache it
     * rather than making a new one on every embedding call.
     */
    static getClient() {
        if (this._client) return this._client;

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.warn('Warning: OPENAI_API_KEY environment variable is missing.');
        }
        this._client = new OpenAI({ apiKey: apiKey || 'dummy-key' });
        return this._client;
    }

    /**
     * Builds the text that gets embedded for a CatalogItem.
     *
     * Core rule: the vector carries CONCEPTS, the filter carries CONSTRAINTS.
     * Exact prices, calorie counts, prep minutes are constraints — putting raw
     * digits in here degrades retrieval, since embeddings carry no numeric
     * ordering. They're converted to qualitative tiers instead, so "something
     * cheap and light" matches semantically while "under $10" is still
     * enforced exactly by price: { $lte: 10 } in the query filter.
     *
     * @param {Object} item          CatalogItem (lean doc or hydrated)
     * @param {String} [categoryName] optional override; falls back to item.categoryName
     */
    static buildItemEmbeddingText(item, categoryName = '') {
        const parts = [];
        const resolvedCategory = categoryName || item.categoryName || '';

        // Name leads, and appears twice — otherwise a long description dilutes
        // the single most discriminating field in the document.
        parts.push(item.name);
        if (resolvedCategory) {
            parts.push(`${item.name}, a ${resolvedCategory}`);
        }

        if (item.description) {
            parts.push(item.description);
        }

        const attrs = item.attributes || {};

        // The longer story / culinary heritage
        if (attrs.longerStory) {
            parts.push(attrs.longerStory);
        }

        // Dietary tags with rich semantic keywords
        const dietaryTags = Array.isArray(attrs.dietaryTags) ? attrs.dietaryTags : Array.isArray(item.tags) ? item.tags : [];
        if (dietaryTags.length > 0) {
            const enrichedDietary = dietaryTags.map((t) => DIETARY_SYNONYMS[t.toLowerCase()] || t).join('. ');
            parts.push(`Dietary suitability: ${enrichedDietary}`);
        }

        // Allergens with explicit safety & warning tokens
        if (Array.isArray(attrs.allergens) && attrs.allergens.length > 0) {
            parts.push(`Contains allergens: ${attrs.allergens.join(', ')}. Not suitable for diners with allergies to ${attrs.allergens.join(', ')}.`);
        }

        // Nutrition & Macros
        if (attrs.macros && typeof attrs.macros === 'object') {
            const { protein, carbs, fat } = attrs.macros;
            const macroDescs = [];
            if (protein) {
                macroDescs.push(`${protein}g protein`);
                if (Number(protein) >= 20) macroDescs.push('high-protein, muscle building, gym diet');
            }
            if (carbs) {
                macroDescs.push(`${carbs}g carbs`);
                if (Number(carbs) <= 10) macroDescs.push('low-carb');
            }
            if (fat) macroDescs.push(`${fat}g fat`);
            if (macroDescs.length > 0) {
                parts.push(`Nutritional macros: ${macroDescs.join(', ')}`);
            }
        }

        // Prep time
        if (attrs.prepTime) {
            const prepMinutes = Number(attrs.prepTime);
            if (prepMinutes <= 12) {
                parts.push(`Ready in ${prepMinutes} minutes. Quick prep, fast food, quick service`);
            } else if (prepMinutes >= 30) {
                parts.push(`Takes ${prepMinutes} minutes. Made to order, slow cooked, artisanal prep`);
            } else {
                parts.push(`Takes ${prepMinutes} minutes to prepare`);
            }
        }

        // Calories
        if (attrs.calories) {
            const cal = Number(attrs.calories);
            if (cal <= 350) {
                parts.push(`${cal} calories, low calorie, light dish, healthy diet`);
            } else if (cal >= 700) {
                parts.push(`${cal} calories, rich and filling, hearty meal`);
            } else {
                parts.push(`${cal} calories`);
            }
        }

        // Portion / Servings
        if (attrs.portion) {
            const { value, unit, serves } = attrs.portion;
            if (serves && Number(serves) > 1) {
                parts.push(`Serves ${serves} people, shareable plate, family style`);
            } else if (serves) {
                parts.push(`Single serving for ${serves} person`);
            }
            if (value && unit) {
                parts.push(`Portion size: ${value} ${unit}`);
            }
        }

        // Chef recommendations & highlights
        if (attrs.isTonightPick) {
            parts.push("Chef's pick, tonight's recommendation, featured house special, must-try");
        }

        // Available size options
        if (Array.isArray(attrs.sizes) && attrs.sizes.length > 0) {
            const sizeNames = attrs.sizes.map((s) => s.name).filter(Boolean);
            if (sizeNames.length > 0) {
                parts.push(`Available in sizes: ${sizeNames.join(', ')}`);
            }
        }

        if (Array.isArray(item.tags) && item.tags.length > 0) {
            parts.push(item.tags.join(', '));
        }

        if (Array.isArray(item.ingredients) && item.ingredients.length > 0) {
            parts.push(`Made with ${item.ingredients.join(', ')}`);
        }

        const descriptors = [];
        for (const [key, value] of asEntries(item.attributes)) {
            if (value === null || value === undefined || value === '') continue;

            const k = normaliseKey(key);
            if (SKIPPED_ATTRIBUTES.has(k)) continue;
            if (['dietarytags', 'allergens', 'longerstory', 'macros', 'portion', 'istonightpick', 'ishighmargin', 'sizes'].includes(k)) continue;

            if (NUMERIC_ATTRIBUTES.has(k)) {
                const bucket = describeNumericAttribute(key, value);
                if (bucket) descriptors.push(bucket);
            } else if (typeof value === 'string' || typeof value === 'number') {
                descriptors.push(`${value} ${key}`.toLowerCase());
            }
        }

        const tier = priceTier(item.price);
        if (tier) descriptors.push(tier);

        if (descriptors.length > 0) {
            parts.push(descriptors.join(', '));
        }

        return parts
            .filter(Boolean)
            .map((p) => String(p).trim())
            .join('. ')
            .replace(/\.\s*\./g, '.')
            .trim();
    }

    static hashEmbeddingText(text) {
        return crypto
            .createHash('sha1')
            .update(text || '')
            .digest('hex');
    }

    static async createEmbedding(text, tenantId = null) {
        if (!text || text.trim() === '') {
            return [];
        }

        const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
        const client = this.getClient();

        const maxRetries = 2;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await client.embeddings.create({
                    model,
                    input: text.trim()
                });

                const vector = response.data[0].embedding;
                const inputTokens = response.usage ? response.usage.total_tokens : 0;

                if (tenantId) {
                    await CostService.logUsage({
                        tenantId,
                        model,
                        operation: 'EMBEDDING',
                        inputTokens
                    });
                }

                return vector;
            } catch (err) {
                const retriable = err.status === 429 || err.status >= 500;
                if (retriable && attempt < maxRetries) {
                    const backoffMs = 300 * 2 ** attempt;
                    console.warn(`OpenAI embedding retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms:`, err.message);
                    await new Promise((resolve) => setTimeout(resolve, backoffMs));
                    continue;
                }
                console.error('Error generating OpenAI embedding:', err.message);
                // Return empty array on failure so application flow doesn't crash completely.
                return [];
            }
        }

        return [];
    }

    /**
     * Batch variant — OpenAI accepts an array of strings in one request, which
     * is far cheaper and faster than N sequential createEmbedding calls when
     * re-indexing a catalog. Returns vectors in the same order as inputTexts;
     * a failed batch returns an array of empty arrays, matched to inputTexts.length,
     * so callers can index-align results without special-casing failure.
     */
    static async createEmbeddingsBatch(texts, tenantId = null) {
        const cleaned = texts.map((t) => (t && t.trim() ? t.trim() : null));
        const nonEmptyIdx = cleaned.map((t, i) => (t ? i : -1)).filter((i) => i !== -1);

        if (nonEmptyIdx.length === 0) {
            return cleaned.map(() => []);
        }

        const model = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
        const client = this.getClient();
        const input = nonEmptyIdx.map((i) => cleaned[i]);

        try {
            const response = await client.embeddings.create({ model, input });

            const inputTokens = response.usage ? response.usage.total_tokens : 0;
            if (tenantId) {
                await CostService.logUsage({
                    tenantId,
                    model,
                    operation: 'EMBEDDING',
                    inputTokens
                });
            }

            const results = cleaned.map(() => []);
            response.data.forEach((d, j) => {
                results[nonEmptyIdx[j]] = d.embedding;
            });
            return results;
        } catch (err) {
            console.error('Error generating OpenAI embeddings batch:', err.message);
            return cleaned.map(() => []);
        }
    }

    /**
     * Re-embeds CatalogItem docs whose embedding is missing, out of date, or
     * whose source text changed. Safe to run repeatedly — unchanged items cost
     * nothing beyond a version-field update.
     *
     * @param {Model}  CatalogItem  Mongoose model, passed in to avoid a require
     *                              cycle between the model and this service.
     * @param {String} [tenantId]   limit the run to one tenant
     * @param {Number} [batchSize]  items embedded per OpenAI batch call
     */
    static async reindexStaleItems({ CatalogItem, Category, tenantId, batchSize = 50 }) {
        const query = { embeddingVersion: { $lt: EMBEDDING_VERSION } };
        if (tenantId) query.tenantId = tenantId;

        let processed = 0;
        let reembedded = 0;
        let skipped = 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const batch = await CatalogItem.find(query).select('+embeddingHash').limit(batchSize).lean();

            if (batch.length === 0) break;

            // categoryName isn't denormalized on the item — batch-fetch the
            // names for this page's categoryIds rather than one query per item.
            const categoryIds = [...new Set(batch.map((item) => String(item.categoryId)))];
            const categories = await Category.find({ _id: { $in: categoryIds } }, { name: 1 }).lean();
            const categoryNameById = new Map(categories.map((c) => [String(c._id), c.name]));

            const texts = batch.map((item) => this.buildItemEmbeddingText(item, categoryNameById.get(String(item.categoryId)) || ''));
            const hashes = texts.map((t) => this.hashEmbeddingText(t));

            const toEmbedIdx = batch.map((item, i) => (item.embeddingHash === hashes[i] && item.embedding?.length ? -1 : i)).filter((i) => i !== -1);

            // Unchanged items: just stamp the new version, no API spend.
            const unchangedIds = batch.filter((_, i) => !toEmbedIdx.includes(i)).map((item) => item._id);

            if (unchangedIds.length) {
                await CatalogItem.updateMany({ _id: { $in: unchangedIds } }, { $set: { embeddingVersion: EMBEDDING_VERSION } });
                skipped += unchangedIds.length;
            }

            if (toEmbedIdx.length) {
                const vectors = await this.createEmbeddingsBatch(
                    toEmbedIdx.map((i) => texts[i]),
                    tenantId
                );

                await Promise.all(
                    toEmbedIdx.map((i, j) => {
                        const vector = vectors[j];
                        if (!vector || !vector.length) {
                            console.warn('[reindex] embedding failed for', String(batch[i]._id));
                            return Promise.resolve();
                        }
                        return CatalogItem.updateOne(
                            { _id: batch[i]._id },
                            {
                                $set: {
                                    embedding: vector,
                                    embeddingHash: hashes[i],
                                    embeddingVersion: EMBEDDING_VERSION,
                                    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
                                    embeddedAt: new Date()
                                }
                            }
                        );
                    })
                );
                reembedded += toEmbedIdx.length;
            }

            processed += batch.length;
            console.log(`[reindex] ${processed} processed (${reembedded} embedded, ${skipped} skipped)`);
        }

        return { processed, reembedded, skipped };
    }
}

EmbeddingService.EMBEDDING_VERSION = EMBEDDING_VERSION;
EmbeddingService.PRICE_TIERS = PRICE_TIERS;

module.exports = EmbeddingService;
