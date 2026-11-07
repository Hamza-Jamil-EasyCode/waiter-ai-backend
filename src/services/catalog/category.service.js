const Category = require('../../models/Category');
const CatalogItem = require('../../models/CatalogItem');

class CategoryService {
    static async createCategory(tenantId, catalogId, data) {
        return await Category.create({
            ...data,
            tenantId,
            catalogId
        });
    }

    static async getCategories(tenantId, catalogId) {
        return await Category.find({ tenantId, catalogId }).sort({ sortOrder: 1, name: 1 }).lean();
    }

    static async reorderCategories(tenantId, catalogId, orderedCategoryIds) {
        if (!Array.isArray(orderedCategoryIds)) {
            throw new Error('orderedCategoryIds must be an array');
        }

        const bulkOps = orderedCategoryIds.map((id, index) => ({
            updateOne: {
                filter: { _id: id, tenantId, catalogId },
                update: { $set: { sortOrder: index } }
            }
        }));

        if (bulkOps.length > 0) {
            await Category.bulkWrite(bulkOps);
        }

        return await Category.find({ tenantId, catalogId }).sort({ sortOrder: 1, name: 1 }).lean();
    }

    static async getCategoryById(tenantId, categoryId) {
        const category = await Category.findOne({ _id: categoryId, tenantId }).lean();
        if (!category) throw new Error('Category not found');
        return category;
    }

    static async updateCategory(tenantId, categoryId, data) {
        const category = await Category.findOneAndUpdate(
            { _id: categoryId, tenantId },
            { $set: data },
            { new: true, runValidators: true }
        );
        if (!category) throw new Error('Category not found');
        return category;
    }

    static async deleteCategory(tenantId, categoryId) {
        const category = await Category.findOneAndDelete({ _id: categoryId, tenantId });
        if (!category) throw new Error('Category not found');

        // Delete or unassign items in this category
        await CatalogItem.deleteMany({ categoryId, tenantId });

        return category;
    }
}

module.exports = CategoryService;
