const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const mongooseConfig = require('../src/config/mongoose');
const Tenant = require('../src/models/Tenant');
const User = require('../src/models/User');
const Catalog = require('../src/models/Catalog');
const Category = require('../src/models/Category');
const CatalogItem = require('../src/models/CatalogItem');
const ItemService = require('../src/services/catalog/item.service');
const CatalogService = require('../src/services/catalog/catalog.service');
const AssistantService = require('../src/services/ai/assistant.service');

const SAMPLE_ITEMS = [
    // APPETIZERS
    {
        categoryName: 'Appetizers',
        name: 'Crispy Truffle Arancini',
        description: 'Golden-fried Italian risotto balls infused with black truffle oil, aged parmesan, and creamy mozzarella center. Served with spicy marinara sauce.',
        price: 14.50,
        tags: ['vegetarian', 'popular', 'chef-special'],
        ingredients: ['arborio rice', 'black truffle oil', 'parmesan', 'mozzarella', 'breadcrumbs', 'marinara'],
        attributes: { Spiciness: 'Mild', Calories: '480 kcal', PrepTime: '10 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Appetizers',
        name: 'Wild Mushroom Bruschetta',
        description: 'Artisanal sourdough toast topped with sautéed wild mushrooms, garlic, fresh thyme, and microgreens drizzled with balsamic glaze.',
        price: 12.00,
        tags: ['vegan', 'dairy-free'],
        ingredients: ['sourdough bread', 'wild mushrooms', 'garlic', 'thyme', 'balsamic glaze', 'olive oil'],
        attributes: { Spiciness: 'None', Calories: '310 kcal', PrepTime: '8 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Appetizers',
        name: 'Smoked Salmon Tartare',
        description: 'Fresh Norwegian smoked salmon diced with capers, shallots, dill, and avocado puree. Accompanied by crispy crostini.',
        price: 16.50,
        tags: ['seafood', 'gluten-free-option'],
        ingredients: ['norwegian salmon', 'capers', 'shallots', 'dill', 'avocado', 'crostini'],
        attributes: { Spiciness: 'None', Calories: '390 kcal', PrepTime: '12 mins' },
        isAvailable: true
    },

    // MAIN COURSES
    {
        categoryName: 'Main Courses',
        name: 'Pan-Seared Ribeye Steak',
        description: '12oz prime Angus ribeye cooked to perfection with garlic herb butter, roasted asparagus, and truffle mashed potatoes.',
        price: 34.00,
        tags: ['gluten-free', 'meat', 'signature'],
        ingredients: ['angus beef ribeye', 'butter', 'rosemary', 'garlic', 'asparagus', 'potatoes', 'truffle oil'],
        attributes: { Spiciness: 'None', Calories: '850 kcal', PrepTime: '20 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Main Courses',
        name: 'Creamy Tuscan Chicken Pasta',
        description: 'Fettuccine pasta tossed in a rich sun-dried tomato and spinach garlic cream sauce with tender grilled chicken breast.',
        price: 22.50,
        tags: ['popular', 'pasta'],
        ingredients: ['fettuccine', 'chicken breast', 'heavy cream', 'sun-dried tomatoes', 'spinach', 'parmesan'],
        attributes: { Spiciness: 'Mild', Calories: '720 kcal', PrepTime: '15 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Main Courses',
        name: 'Roasted Pumpkin & Sage Risotto',
        description: 'Creamy Arborio risotto cooked with roasted butternut squash, crispy sage, and toasted pine nuts.',
        price: 19.00,
        tags: ['vegan', 'gluten-free', 'nut-warning'],
        ingredients: ['arborio rice', 'butternut squash', 'vegetable broth', 'sage', 'pine nuts', 'olive oil'],
        attributes: { Spiciness: 'None', Calories: '510 kcal', PrepTime: '18 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Main Courses',
        name: 'Mediterranean Grilled Salmon',
        description: 'Fresh wild-caught salmon fillet grilled with lemon, herbs, served over quinoa tabouli and roasted cherry tomatoes.',
        price: 27.00,
        tags: ['gluten-free', 'seafood', 'healthy'],
        ingredients: ['wild salmon', 'lemon', 'quinoa', 'parsley', 'mint', 'cherry tomatoes', 'olive oil'],
        attributes: { Spiciness: 'None', Calories: '590 kcal', PrepTime: '16 mins' },
        isAvailable: true
    },

    // DESSERTS
    {
        categoryName: 'Desserts',
        name: 'Classic Venetian Tiramisu',
        description: 'Traditional Italian dessert made with espresso-soaked ladyfingers, velvety mascarpone cream, and dusted with dark cocoa powder.',
        price: 9.50,
        tags: ['vegetarian', 'dessert', 'coffee'],
        ingredients: ['ladyfingers', 'espresso', 'mascarpone', 'cocoa powder', 'eggs', 'sugar'],
        attributes: { Spiciness: 'None', Calories: '420 kcal', PrepTime: '5 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Desserts',
        name: 'Decadent Molten Lava Cake',
        description: 'Warm chocolate cake with a rich flowing dark chocolate center, served with vanilla bean ice cream and fresh berries.',
        price: 11.00,
        tags: ['vegetarian', 'dessert', 'popular'],
        ingredients: ['dark chocolate', 'butter', 'flour', 'sugar', 'eggs', 'vanilla ice cream', 'raspberries'],
        attributes: { Spiciness: 'None', Calories: '560 kcal', PrepTime: '10 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Desserts',
        name: 'Coconut Panna Cotta',
        description: 'Silky smooth coconut milk panna cotta topped with passionfruit coulis and fresh mango cubes.',
        price: 8.50,
        tags: ['vegan', 'gluten-free', 'dairy-free'],
        ingredients: ['coconut milk', 'agar agar', 'passionfruit', 'mango', 'maple syrup'],
        attributes: { Spiciness: 'None', Calories: '290 kcal', PrepTime: '5 mins' },
        isAvailable: true
    },

    // BEVERAGES
    {
        categoryName: 'Beverages',
        name: 'Sparkling Hibiscus Mint Iced Tea',
        description: 'Refreshing brewed hibiscus flower tea infused with fresh mint leaves, lime juice, and organic agave nectar.',
        price: 5.50,
        tags: ['vegan', 'beverage', 'refreshing'],
        ingredients: ['hibiscus tea', 'fresh mint', 'lime juice', 'agave nectar', 'sparkling water'],
        attributes: { Spiciness: 'None', Calories: '90 kcal', PrepTime: '3 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Beverages',
        name: 'Artisanal Double Espresso',
        description: 'Rich and bold espresso brewed from 100% organic Ethiopian Arabica coffee beans.',
        price: 4.00,
        tags: ['vegan', 'beverage', 'hot'],
        ingredients: ['ethiopian coffee beans', 'water'],
        attributes: { Spiciness: 'None', Calories: '5 kcal', PrepTime: '2 mins' },
        isAvailable: true
    }
];

async function seedCatalog() {
    console.log('🚀 Starting Test Catalog Seed Process...\n');

    try {
        await mongooseConfig.connect();

        // 1. Create or Find Tenant
        const tenantSlug = 'gourmet-bistro';
        let tenant = await Tenant.findOne({ slug: tenantSlug });

        if (!tenant) {
            tenant = await Tenant.create({
                name: 'Gourmet Bistro & Cafe',
                slug: tenantSlug,
                defaultLanguage: 'en',
                status: 'ACTIVE',
                primaryColor: '#eab308',
                secondaryColor: '#0f172a'
            });
            console.log(`✅ Created test tenant: "${tenant.name}" (Slug: ${tenant.slug})`);
        } else {
            console.log(`ℹ️ Found existing tenant: "${tenant.name}" (${tenant._id})`);
        }

        const tenantId = tenant._id.toString();

        // 1b. Create or Update Tenant Admin User for Login
        const adminEmail = 'restaurant@gourmetbistro.com';
        const rawPassword = 'Admin@123';

        await User.deleteMany({ email: adminEmail });
        const adminUser = await User.create({
            firstName: 'Gourmet',
            lastName: 'Bistro Admin',
            email: adminEmail,
            password: rawPassword,
            role: 'TENANT_ADMIN',
            tenantId: tenant._id,
            status: 'ACTIVE'
        });
        console.log(`✅ Created Tenant Admin User: ${adminUser.email} (Password: ${rawPassword})`);

        // 2. Clean up previous test catalog data for this tenant
        const existingCatalogs = await Catalog.find({ tenantId });
        for (const cat of existingCatalogs) {
            await CatalogService.deleteCatalog(tenantId, cat._id.toString());
        }
        console.log('🧹 Cleaned up old test catalog records.');

        // 3. Create New Catalog
        const catalog = await CatalogService.createCatalog(tenantId, {
            name: 'Summer Signature Menu 2026',
            description: 'Curated artisanal dining menu featuring fresh ingredients, vegan options, and steaks.'
        });
        console.log(`✅ Created Catalog: "${catalog.name}" (${catalog._id})`);

        // 4. Create Categories
        const categoryNames = ['Appetizers', 'Main Courses', 'Desserts', 'Beverages'];
        const categoryMap = new Map();

        for (let i = 0; i < categoryNames.length; i++) {
            const catName = categoryNames[i];
            const category = await Category.create({
                name: catName,
                tenantId,
                catalogId: catalog._id,
                sortOrder: i + 1
            });
            categoryMap.set(catName, category._id.toString());
            console.log(`   📂 Created Category: ${catName}`);
        }

        // 5. Create Catalog Items & Generate AI Embeddings
        console.log(`\n⏳ Creating ${SAMPLE_ITEMS.length} items and generating OpenAI vector embeddings...`);
        let createdCount = 0;

        for (const itemData of SAMPLE_ITEMS) {
            const categoryId = categoryMap.get(itemData.categoryName);
            const itemPayload = {
                name: itemData.name,
                description: itemData.description,
                price: itemData.price,
                tags: itemData.tags,
                ingredients: itemData.ingredients,
                attributes: itemData.attributes,
                isAvailable: itemData.isAvailable,
                categoryId
            };

            await ItemService.createItem(tenantId, catalog._id.toString(), itemPayload);
            createdCount++;
            process.stdout.write(`   ✨ Created [${createdCount}/${SAMPLE_ITEMS.length}]: ${itemData.name}\n`);
        }

        // 6. Publish Catalog
        await CatalogService.publishCatalog(tenantId, catalog._id.toString());
        console.log(`\n🎉 Published Catalog "${catalog.name}" successfully!`);

        // 7. Execute Sample AI Agent Queries to test AI Waiter response & log CHAT token costs!
        // console.log('\n🤖 Testing AI Waiter Agent with sample customer questions...');

        // const testQuestions = [
        //     'do we have anything gluten free',
        //     'What vegan and dairy-free options do you have on the menu?',
        //     'What is the price of the Pan-Seared Ribeye Steak and how long does it take to prepare?'
        // ];

        // for (const q of testQuestions) {
        //     console.log(`\n❓ Customer Question: "${q}"`);
        //     const aiResponse = await AssistantService.askQuestion({
        //         tenant,
        //         question: q,
        //         sessionId: 'seed-test-session'
        //     });
        //     console.log(`💡 AI Waiter Answer:\n   ${aiResponse.answer}`);
        //     console.log(`   [Retrieved ${aiResponse.retrievedItems.length} matching items]`);
        // }

        console.log('\n======================================================');
        console.log('✅ TEST CATALOG & AI COST LOGGING COMPLETED SUCCESSFULLY!');
        console.log('======================================================');
        console.log(`🔐 Tenant Admin Login Credentials : Email: ${adminEmail} | Password: ${rawPassword}`);
        console.log(`📍 Public Customer Menu URL      : http://localhost:5173/c/${tenant.slug}`);
        console.log(`📊 Super Admin AI Costs UI      : http://localhost:5173/admin/costs`);
        console.log('======================================================\n');
    } catch (err) {
        console.error('❌ Error during catalog seeding:', err);
    } finally {
        await mongooseConfig.disconnect();
        process.exit(0);
    }
}

seedCatalog();
