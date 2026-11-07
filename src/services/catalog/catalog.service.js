const Catalog = require('../../models/Catalog');
const CatalogItem = require('../../models/CatalogItem');
const Category = require('../../models/Category');
const Tenant = require('../../models/Tenant');
const QRCode = require('qrcode');
const EmbeddingService = require('../ai/embedding.service');
const TranslationService = require('../translation/translation.service');

class CatalogService {
    static async createCatalog(tenantId, data) {
        return await Catalog.create({
            ...data,
            tenantId
        });
    }

    static async getCatalogs(tenantId) {
        return await Catalog.find({ tenantId }).sort({ createdAt: -1 }).lean();
    }

    static async getCatalogById(tenantId, catalogId) {
        const catalog = await Catalog.findOne({ _id: catalogId, tenantId }).lean();
        if (!catalog) throw new Error('Catalog not found');
        return catalog;
    }

    static async updateCatalog(tenantId, catalogId, data) {
        const catalog = await Catalog.findOneAndUpdate({ _id: catalogId, tenantId }, { $set: data }, { new: true, runValidators: true });
        if (!catalog) throw new Error('Catalog not found');
        return catalog;
    }

    static async deleteCatalog(tenantId, catalogId) {
        const catalog = await Catalog.findOneAndDelete({ _id: catalogId, tenantId });
        if (!catalog) throw new Error('Catalog not found');

        await Promise.all([Category.deleteMany({ catalogId, tenantId }), CatalogItem.deleteMany({ catalogId, tenantId })]);

        return catalog;
    }

    static async publishCatalog(tenantId, catalogId, options = {}) {
        const catalog = await Catalog.findOne({ _id: catalogId, tenantId });
        if (!catalog) throw new Error('Catalog not found');

        // Check if there is already another published menu for this tenant
        const existingPublished = await Catalog.findOne({
            tenantId,
            status: 'PUBLISHED',
            _id: { $ne: catalogId }
        }).lean();

        if (existingPublished) {
            if (!options.force && !options.unpublishOthers) {
                const err = new Error(
                    `There is already another menu published with "${existingPublished.name}". Only one menu should be active per service type, otherwise the waiter answers from whichever loads first.`
                );
                err.code = 'ALREADY_PUBLISHED';
                err.existingMenu = {
                    id: existingPublished._id.toString(),
                    name: existingPublished.name
                };
                throw err;
            }

            if (options.unpublishOthers) {
                await Catalog.updateMany({ tenantId, status: 'PUBLISHED', _id: { $ne: catalogId } }, { $set: { status: 'DRAFT' } });
            }
        }

        catalog.status = 'PUBLISHED';
        catalog.version += 1;
        await catalog.save();

        // Regenerate embeddings for items missing embeddings or whose content has changed
        const items = await CatalogItem.find({ catalogId, tenantId }).select('+embedding +embeddingHash');
        const categoryMap = new Map();
        const categories = await Category.find({ catalogId, tenantId }).lean();
        categories.forEach((cat) => categoryMap.set(cat._id.toString(), cat.name));

        // Fast batch embedding generation
        const itemsToEmbed = [];
        const textsToEmbed = [];
        const hashes = [];

        for (const item of items) {
            const categoryName = categoryMap.get(item.categoryId ? item.categoryId.toString() : '') || '';
            const embeddingText = EmbeddingService.buildItemEmbeddingText(item, categoryName);
            const currentHash = EmbeddingService.hashEmbeddingText(embeddingText);

            // Skip re-embedding if vector exists and content hash matches
            if (item.embedding && item.embedding.length > 0 && item.embeddingHash === currentHash) {
                continue;
            }

            itemsToEmbed.push(item);
            textsToEmbed.push(embeddingText);
            hashes.push(currentHash);
        }

        if (itemsToEmbed.length > 0) {
            // Embed up to 50 items per OpenAI API batch call in a single network round-trip
            const BATCH_SIZE = 50;
            const bulkOps = [];

            for (let i = 0; i < itemsToEmbed.length; i += BATCH_SIZE) {
                const batchTexts = textsToEmbed.slice(i, i + BATCH_SIZE);
                const batchItems = itemsToEmbed.slice(i, i + BATCH_SIZE);
                const batchHashes = hashes.slice(i, i + BATCH_SIZE);

                try {
                    const vectors = await EmbeddingService.createEmbeddingsBatch(batchTexts, tenantId);
                    vectors.forEach((vec, idx) => {
                        if (vec && vec.length > 0) {
                            bulkOps.push({
                                updateOne: {
                                    filter: { _id: batchItems[idx]._id },
                                    update: {
                                        $set: {
                                            embedding: vec,
                                            embeddingHash: batchHashes[idx],
                                            embeddingVersion: catalog.version
                                        }
                                    }
                                }
                            });
                        }
                    });
                } catch (err) {
                    console.error('Batch embedding generation error in publishCatalog:', err.message);
                }
            }

            if (bulkOps.length > 0) {
                await CatalogItem.bulkWrite(bulkOps);
            }
        }

        // Auto-translate menu into all supported languages in the background and save to DB
        setImmediate(() => {
            TranslationService.translateCatalogToAllLanguages({ tenantId, catalogId }).catch((transErr) => {
                console.error(`Background pre-translation failed for catalog ${catalogId}:`, transErr.message);
            });
        });

        return catalog;
    }

    static async unpublishCatalog(tenantId, catalogId) {
        const catalog = await Catalog.findOneAndUpdate({ _id: catalogId, tenantId }, { $set: { status: 'DRAFT' } }, { new: true });
        if (!catalog) throw new Error('Catalog not found');
        return catalog;
    }

    static async generateQRCode(tenantId, catalogId, format = 'dataUrl') {
        const catalog = await Catalog.findOne({ _id: catalogId, tenantId });
        if (!catalog) throw new Error('Catalog not found');

        const tenant = await Tenant.findById(tenantId).lean();
        if (!tenant) throw new Error('Tenant not found');

        const domain = process.env.FRONTEND_DOMAIN || process.env.UI_LINK || 'http://localhost:5173';
        const publicUrl = `${domain.replace(/\/$/, '')}/c/${tenant.slug}`;

        if (format === 'svg') {
            return await QRCode.toString(publicUrl, { type: 'svg' });
        } else if (format === 'png') {
            return await QRCode.toBuffer(publicUrl, { type: 'png' });
        } else {
            return await QRCode.toDataURL(publicUrl);
        }
    }
}

module.exports = CatalogService;
