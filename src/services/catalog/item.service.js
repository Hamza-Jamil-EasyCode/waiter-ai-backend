const CatalogItem = require('../../models/CatalogItem');
const Category = require('../../models/Category');
const Catalog = require('../../models/Catalog');
const EmbeddingService = require('../ai/embedding.service');

class ItemService {
    static async createItem(tenantId, catalogId, data) {
        let categoryName = '';
        if (data.categoryId) {
            const category = await Category.findOne({ _id: data.categoryId, tenantId }).lean();
            if (category) categoryName = category.name;
        }

        const item = new CatalogItem({
            ...data,
            tenantId,
            catalogId
        });

        // Only generate embedding if the catalog is already PUBLISHED
        const catalog = await Catalog.findOne({ _id: catalogId, tenantId }).lean();
        if (catalog && catalog.status === 'PUBLISHED') {
            const embeddingText = EmbeddingService.buildItemEmbeddingText(item, categoryName);
            try {
                const vector = await EmbeddingService.createEmbedding(embeddingText, tenantId);
                item.embedding = vector;
                item.embeddingHash = EmbeddingService.hashEmbeddingText(embeddingText);
                item.embeddingVersion = catalog.version || 1;
            } catch (err) {
                console.error('Failed to generate initial embedding for item:', err.message);
            }
        }

        await item.save();
        return item;
    }

    static async getItems(tenantId, catalogId, queryParams = {}) {
        const { categoryId, minPrice, maxPrice, isAvailable, tags, search, page = 1, limit = 50 } = queryParams;

        const filter = { tenantId, catalogId };

        if (categoryId) filter.categoryId = categoryId;
        if (isAvailable !== undefined) filter.isAvailable = isAvailable === 'true' || isAvailable === true;

        if (minPrice !== undefined || maxPrice !== undefined) {
            filter.price = {};
            if (minPrice !== undefined) filter.price.$gte = Number(minPrice);
            if (maxPrice !== undefined) filter.price.$lte = Number(maxPrice);
        }

        if (tags) {
            const tagArray = Array.isArray(tags) ? tags : tags.split(',').map((t) => t.trim());
            filter.tags = { $in: tagArray };
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);

        const [items, total] = await Promise.all([
            CatalogItem.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(Number(limit)).lean(),
            CatalogItem.countDocuments(filter)
        ]);

        return {
            items,
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit))
        };
    }

    static async getItemById(tenantId, itemId) {
        const item = await CatalogItem.findOne({ _id: itemId, tenantId }).lean();
        if (!item) throw new Error('Catalog item not found');
        return item;
    }

    static async updateItem(tenantId, itemId, data) {
        const existingItem = await CatalogItem.findOne({ _id: itemId, tenantId }).select('+embedding +embeddingHash');
        if (!existingItem) throw new Error('Catalog item not found');

        // Check if embedding-relevant fields changed
        const embeddingFieldsChanged =
            (data.name !== undefined && data.name !== existingItem.name) ||
            (data.description !== undefined && data.description !== existingItem.description) ||
            (data.categoryId !== undefined && data.categoryId?.toString() !== existingItem.categoryId?.toString()) ||
            (data.tags !== undefined && JSON.stringify(data.tags) !== JSON.stringify(existingItem.tags)) ||
            (data.ingredients !== undefined && JSON.stringify(data.ingredients) !== JSON.stringify(existingItem.ingredients)) ||
            (data.attributes !== undefined && JSON.stringify(data.attributes) !== JSON.stringify(existingItem.attributes));

        Object.assign(existingItem, data);

        // Only regenerate embedding if this catalog is currently PUBLISHED
        const catalog = await Catalog.findOne({ _id: existingItem.catalogId, tenantId }).lean();
        if (catalog && catalog.status === 'PUBLISHED' && embeddingFieldsChanged) {
            let categoryName = '';
            if (existingItem.categoryId) {
                const category = await Category.findOne({ _id: existingItem.categoryId, tenantId }).lean();
                if (category) categoryName = category.name;
            }

            const embeddingText = EmbeddingService.buildItemEmbeddingText(existingItem, categoryName);
            const currentHash = EmbeddingService.hashEmbeddingText(embeddingText);

            // Re-embed if text hash has changed or missing embedding
            if (existingItem.embeddingHash !== currentHash || !existingItem.embedding?.length) {
                try {
                    const vector = await EmbeddingService.createEmbedding(embeddingText, tenantId);
                    existingItem.embedding = vector;
                    existingItem.embeddingHash = currentHash;
                    existingItem.embeddingVersion = catalog.version || 1;
                } catch (err) {
                    console.error('Failed to regenerate embedding on update:', err.message);
                }
            }
        }

        await existingItem.save();
        return existingItem;
    }

    static async deleteItem(tenantId, itemId) {
        const item = await CatalogItem.findOneAndDelete({ _id: itemId, tenantId });
        if (!item) throw new Error('Catalog item not found');
        return item;
    }
}

module.exports = ItemService;
