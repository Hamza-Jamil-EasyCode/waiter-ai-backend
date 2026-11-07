const crypto = require('crypto');
const OpenAI = require('openai');
const TranslationCache = require('../../models/TranslationCache');
const Catalog = require('../../models/Catalog');
const Category = require('../../models/Category');
const CatalogItem = require('../../models/CatalogItem');
const CostService = require('../ai/cost.service');

class TranslationService {
    // Supported dropdown languages (target languages to pre-translate)
    static SUPPORTED_LANGUAGES = ['zh', 'ar', 'fr', 'es', 'de', 'nl'];

    static async getOrTranslateCatalog({ tenantId, catalogId, targetLanguage = 'en' }) {
        const catalog = await Catalog.findOne({ _id: catalogId, tenantId }).lean();
        if (!catalog) throw new Error('Catalog not found');

        const sourceLanguage = (catalog.language || 'en').toLowerCase();
        if (targetLanguage.toLowerCase() === sourceLanguage) {
            return null; // No translation needed if requested language matches catalog base language
        }

        const [categories, items] = await Promise.all([
            Category.find({ catalogId, tenantId }).sort({ sortOrder: 1 }).lean(),
            CatalogItem.find({ catalogId, tenantId }).sort({ sortOrder: 1 }).lean()
        ]);

        // Compute content hash from catalog version + item IDs + timestamps
        const rawContentString = JSON.stringify({
            catalogVersion: catalog.version,
            catCount: categories.length,
            itemCount: items.length,
            itemTimestamps: items.map((i) => `${i._id}_${i.updatedAt ? new Date(i.updatedAt).getTime() : 0}`)
        });

        const contentHash = crypto.createHash('md5').update(rawContentString).digest('hex');

        // Check TranslationCache
        const cached = await TranslationCache.findOne({
            tenantId,
            catalogId,
            targetLanguage: targetLanguage.toLowerCase(),
            contentHash
        }).lean();

        if (cached) {
            return cached.translatedContent;
        }

        // Cache miss: Translate using OpenAI
        const translatedContent = await this.translateCatalogWithAI({
            tenantId,
            sourceLanguage,
            targetLanguage,
            categories,
            items
        });

        // Store into TranslationCache
        await TranslationCache.findOneAndUpdate(
            { tenantId, catalogId, targetLanguage: targetLanguage.toLowerCase() },
            {
                tenantId,
                catalogId,
                sourceLanguage,
                targetLanguage: targetLanguage.toLowerCase(),
                contentHash,
                translatedContent
            },
            { upsert: true, new: true }
        );

        return translatedContent;
    }

    static async translateCatalogWithAI({ tenantId, sourceLanguage, targetLanguage, categories, items }) {
        const payloadToTranslate = {
            categories: categories.map((c) => ({
                id: c._id.toString(),
                name: c.name,
                description: c.description || ''
            })),
            items: items.map((i) => ({
                id: i._id.toString(),
                name: i.name,
                description: i.description || '',
                ingredients: i.ingredients || [],
                longerStory: i.attributes?.longerStory || '',
                dietaryTags: i.attributes?.dietaryTags || []
            }))
        };

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return payloadToTranslate;
        }

        const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
        const client = new OpenAI({ apiKey });

        const systemPrompt = `You are a professional restaurant and culinary menu translator. Translate the given JSON catalog from ${sourceLanguage} to ${targetLanguage}.
Maintain identical JSON structure and preserve all "id" keys.
Translate "name", "description", "ingredients", "longerStory", and "dietaryTags" naturally and authentically for dining customers.
Return ONLY valid JSON with keys "categories" and "items".`;

        try {
            const response = await client.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: JSON.stringify(payloadToTranslate) }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3
            });

            const outputJson = JSON.parse(response.choices[0].message.content);

            if (response.usage) {
                await CostService.logUsage({
                    tenantId,
                    model,
                    operation: 'TRANSLATION',
                    inputTokens: response.usage.prompt_tokens,
                    outputTokens: response.usage.completion_tokens
                });
            }

            return outputJson;
        } catch (err) {
            console.error('Translation AI error:', err.message);
            return payloadToTranslate;
        }
    }

    /**
     * Pre-translates a published catalog into all supported languages (including Chinese)
     * and saves each translation directly to TranslationCache in the database.
     */
    static async translateCatalogToAllLanguages({ tenantId, catalogId }) {
        const catalog = await Catalog.findOne({ _id: catalogId, tenantId }).lean();
        if (!catalog) return;

        const sourceLang = (catalog.language || 'en').toLowerCase();
        const targetLanguages = TranslationService.SUPPORTED_LANGUAGES.filter(
            (lang) => lang.toLowerCase() !== sourceLang
        );

        console.log(`Pre-translating catalog ${catalogId} to all target languages: ${targetLanguages.join(', ')}`);

        // Translate all target languages concurrently in parallel
        await Promise.allSettled(
            targetLanguages.map(async (targetLanguage) => {
                try {
                    await TranslationService.getOrTranslateCatalog({
                        tenantId,
                        catalogId,
                        targetLanguage
                    });
                } catch (err) {
                    console.error(`Failed to pre-translate to ${targetLanguage}:`, err.message);
                }
            })
        );
    }
}

module.exports = TranslationService;
