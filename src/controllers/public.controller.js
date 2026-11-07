const Catalog = require('../models/Catalog');
const Category = require('../models/Category');
const CatalogItem = require('../models/CatalogItem');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const TranslationService = require('../services/translation/translation.service');

class PublicController {
    static async getPublicCatalog(req, res, next) {
        try {
            const tenant = req.tenant;
            const tenantId = tenant._id;
            const targetLang = req.query.lang || tenant.defaultLanguage || 'en';

            // Fetch published catalog
            const catalog = await Catalog.findOne({ tenantId, status: 'PUBLISHED' }).lean();

            if (!catalog) {
                return res.status(200).json({
                    success: true,
                    tenant: {
                        name: tenant.name,
                        slug: tenant.slug,
                        logo: tenant.logo,
                        primaryColor: tenant.primaryColor,
                        secondaryColor: tenant.secondaryColor,
                        defaultLanguage: tenant.defaultLanguage
                    },
                    catalog: null,
                    categories: [],
                    items: []
                });
            }

            // Log Analytics CATALOG_VIEW
            const sessionId = req.headers['x-session-id'] || req.query.sessionId || 'anonymous';
            await AnalyticsEvent.create({
                tenantId,
                catalogId: catalog._id,
                sessionId,
                eventType: 'CATALOG_VIEW'
            });

            // Retrieve categories and published items (excluding embeddings)
            const [categories, items] = await Promise.all([
                Category.find({ catalogId: catalog._id, tenantId }).sort({ sortOrder: 1, name: 1 }).lean(),
                CatalogItem.find({ catalogId: catalog._id, tenantId, isAvailable: true })
                    .select('-embedding -embeddingModel -embeddingVersion -tenantId')
                    .sort({ sortOrder: 1, name: 1 })
                    .lean()
            ]);

            let translatedData = null;
            if (targetLang && targetLang !== catalog.language) {
                try {
                    translatedData = await TranslationService.getOrTranslateCatalog({
                        tenantId: tenantId.toString(),
                        catalogId: catalog._id.toString(),
                        targetLanguage: targetLang
                    });
                } catch (tErr) {
                    console.error('Public catalog translation error:', tErr.message);
                }
            }

            let finalCategories = categories;
            let finalItems = items;

            if (translatedData) {
                if (Array.isArray(translatedData.categories) && translatedData.categories.length > 0) {
                    const transCatMap = new Map(translatedData.categories.map((c) => [c.id, c]));
                    finalCategories = categories.map((cat) => {
                        const trans = transCatMap.get(cat._id.toString());
                        if (!trans) return cat;
                        return {
                            ...cat,
                            name: trans.name || cat.name,
                            description: trans.description !== undefined ? trans.description : cat.description
                        };
                    });
                }

                if (Array.isArray(translatedData.items) && translatedData.items.length > 0) {
                    const transItemMap = new Map(translatedData.items.map((i) => [i.id, i]));
                    finalItems = items.map((item) => {
                        const trans = transItemMap.get(item._id.toString());
                        if (!trans) return item;

                        const updatedAttrs = { ...(item.attributes || {}) };
                        if (trans.longerStory !== undefined) updatedAttrs.longerStory = trans.longerStory;
                        if (trans.dietaryTags !== undefined) updatedAttrs.dietaryTags = trans.dietaryTags;

                        return {
                            ...item,
                            name: trans.name || item.name,
                            description: trans.description !== undefined ? trans.description : item.description,
                            ingredients: trans.ingredients || item.ingredients,
                            attributes: updatedAttrs
                        };
                    });
                }
            }

            // Sanitize tenant branding response
            const publicBranding = {
                name: tenant.name,
                slug: tenant.slug,
                logo: tenant.logo,
                primaryColor: tenant.primaryColor,
                secondaryColor: tenant.secondaryColor,
                defaultLanguage: tenant.defaultLanguage
            };

            const publicCatalogInfo = {
                id: catalog._id,
                name: catalog.name,
                description: catalog.description,
                version: catalog.version,
                language: targetLang
            };

            res.status(200).json({
                success: true,
                tenant: publicBranding,
                catalog: publicCatalogInfo,
                categories: finalCategories,
                items: finalItems
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = PublicController;
