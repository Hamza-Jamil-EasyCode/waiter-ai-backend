const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongooseConfig = require('../src/config/mongoose');
const Tenant = require('../src/models/Tenant');
const Catalog = require('../src/models/Catalog');
const Category = require('../src/models/Category');
const CatalogItem = require('../src/models/CatalogItem');
const EmbeddingService = require('../src/services/ai/embedding.service');

const BENCHMARK_ITEMS = [
    // --- BURGERS ---
    {
        categoryName: 'Burgers',
        name: 'Chicken Burger',
        description: 'A juicy crispy chicken patty served on a toasted round bun with melted cheddar cheese, fresh lettuce, garlic and spicy mayonnaise sauce.',
        price: 650,
        currency: 'Rs.',
        tags: ['chicken', 'burger', 'popular', 'crispy', 'spicy', 'cheesy'],
        ingredients: ['chicken patty', 'round bun', 'cheddar cheese', 'lettuce', 'garlic', 'mayonnaise', 'spicy sauce'],
        attributes: { Spiciness: 'Medium', Calories: '550 kcal', PrepTime: '12 mins', Allergens: ['dairy', 'gluten'] },
        isAvailable: true
    },
    {
        categoryName: 'Burgers',
        name: 'Veggie Supreme Burger',
        description: 'A seasoned potato and green pea vegetable patty topped with crisp lettuce, tomato, cucumber, and tangy mint mayo in a sesame bun.',
        price: 550,
        currency: 'Rs.',
        tags: ['vegetarian', 'burger', 'popular', 'budget-friendly'],
        ingredients: ['vegetable patty', 'sesame bun', 'lettuce', 'tomato', 'cucumber', 'mint mayonnaise'],
        attributes: { Spiciness: 'Mild', Calories: '420 kcal', PrepTime: '10 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Burgers',
        name: 'Fiery Ghost Pepper Burger',
        description: 'Ultra-spicy crispy chicken patty layered with fiery ghost pepper sauce, jalapeños, and melted pepper jack cheese on a toasted brioche bun.',
        price: 950,
        currency: 'Rs.',
        tags: ['chicken', 'burger', 'spicy', 'hot', 'chef-special'],
        ingredients: ['chicken patty', 'ghost pepper sauce', 'jalapenos', 'pepper jack cheese', 'brioche bun'],
        attributes: { Spiciness: 'High', Calories: '620 kcal', PrepTime: '14 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Burgers',
        name: 'Classic Beef Burger',
        description: 'Charbroiled prime beef patty with melted cheddar cheese, sliced tomato, onions, and house burger relish on a warm bun.',
        price: 850,
        currency: 'Rs.',
        tags: ['beef', 'burger', 'classic'],
        ingredients: ['beef patty', 'bun', 'cheddar cheese', 'tomato', 'onion', 'burger relish'],
        attributes: { Spiciness: 'None', Calories: '580 kcal', PrepTime: '15 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Burgers',
        name: 'Smoky BBQ Bacon Burger',
        description: 'Hearty beef patty topped with crispy beef bacon, smoky barbecue sauce, caramelized onions, and aged cheddar.',
        price: 1100,
        currency: 'Rs.',
        tags: ['beef', 'burger', 'smoky'],
        ingredients: ['beef patty', 'beef bacon', 'bbq sauce', 'cheddar cheese', 'bun', 'caramelized onions'],
        attributes: { Spiciness: 'Mild', Calories: '710 kcal', PrepTime: '16 mins' },
        isAvailable: true
    },

    // --- MAIN COURSES ---
    {
        categoryName: 'Main Courses',
        name: 'Grilled Lemon Herb Chicken',
        description: 'Tender chicken breast marinated in fresh lemon juice, garlic, rosemary, and extra virgin olive oil, served with steamed seasonal greens.',
        price: 950,
        currency: 'Rs.',
        tags: ['chicken', 'grilled', 'healthy', 'gluten-free', 'dairy-free', 'light'],
        ingredients: ['chicken breast', 'lemon', 'garlic', 'rosemary', 'olive oil', 'black pepper', 'steamed greens'],
        attributes: { Spiciness: 'None', Calories: '460 kcal', PrepTime: '18 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Main Courses',
        name: 'Crispy Fried Chicken Platter',
        description: 'Four pieces of crispy golden-brown fried chicken drumsticks and thighs served with coleslaw and french fries.',
        price: 1200,
        currency: 'Rs.',
        tags: ['chicken', 'crispy', 'popular', 'comfort'],
        ingredients: ['chicken drumsticks', 'chicken thighs', 'flour', 'spices', 'potatoes', 'coleslaw'],
        attributes: { Spiciness: 'Medium', Calories: '820 kcal', PrepTime: '15 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Main Courses',
        name: 'Royal Butter Chicken',
        description: 'Succulent tandoori chicken cooked in a rich, buttery tomato and cashew gravy with fresh cream and aromatic spices.',
        price: 1600,
        currency: 'Rs.',
        tags: ['chicken', 'curry', 'rich', 'popular'],
        ingredients: ['tandoori chicken', 'butter', 'cream', 'tomatoes', 'cashew paste', 'spices'],
        attributes: { Spiciness: 'Mild', Calories: '890 kcal', PrepTime: '20 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Main Courses',
        name: 'Rosemary Lamb Skewers',
        description: 'Tender skewered lamb marinated in crushed garlic, rosemary, and olive oil with roasted peppers.',
        price: 1800,
        currency: 'Rs.',
        tags: ['grilled', 'meat', 'chef-special', 'high-protein'],
        ingredients: ['lamb chunks', 'garlic', 'rosemary', 'olive oil', 'bell peppers'],
        attributes: { Spiciness: 'Mild', Calories: '720 kcal', PrepTime: '20 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Main Courses',
        name: 'Creamy Four Cheese Pasta',
        description: 'Penne pasta tossed in a luxurious velvety sauce of mozzarella, aged parmesan, gorgonzola, and creamy fontina cheese.',
        price: 1400,
        currency: 'Rs.',
        tags: ['vegetarian', 'pasta', 'cheesy', 'indulgent'],
        ingredients: ['penne pasta', 'mozzarella', 'parmesan', 'gorgonzola', 'fontina', 'heavy cream'],
        attributes: { Spiciness: 'None', Calories: '780 kcal', PrepTime: '15 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Main Courses',
        name: 'Prime Wagyu Tomahawk Steak',
        description: 'A massive 32oz Australian Wagyu tomahawk steak seared over open flame with truffle herb butter and roasted garlic.',
        price: 4500,
        currency: 'Rs.',
        tags: ['beef', 'luxury', 'signature', 'most-expensive', 'chef-special'],
        ingredients: ['wagyu beef tomahawk', 'truffle butter', 'roasted garlic', 'sea salt'],
        attributes: { Spiciness: 'None', Calories: '1150 kcal', PrepTime: '25 mins' },
        isAvailable: true
    },

    // --- SALADS & VEGETARIAN ---
    {
        categoryName: 'Salads & Vegetarian',
        name: 'Crispy Corn & Spinach Salad',
        description: 'Fresh baby spinach leaves and sweet golden corn kernels tossed with crisp bell peppers, virgin olive oil, and zesty fresh lime juice.',
        price: 450,
        currency: 'Rs.',
        tags: ['vegetarian', 'vegan', 'dairy-free', 'gluten-free', 'light', 'healthy'],
        ingredients: ['sweet corn', 'baby spinach', 'bell peppers', 'olive oil', 'lime juice', 'sea salt'],
        attributes: { Spiciness: 'None', Calories: '220 kcal', PrepTime: '8 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Salads & Vegetarian',
        name: 'Paneer Tikka Platter',
        description: 'Cubes of fresh cottage cheese marinated in spiced yogurt and grilled with bell peppers and onions, served with mint chutney.',
        price: 750,
        currency: 'Rs.',
        tags: ['vegetarian', 'spicy', 'appetizer', 'popular'],
        ingredients: ['paneer cottage cheese', 'yogurt', 'bell peppers', 'onions', 'garam masala', 'mint chutney'],
        attributes: { Spiciness: 'Medium', Calories: '480 kcal', PrepTime: '12 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Salads & Vegetarian',
        name: 'Truffle Cheese Arancini',
        description: 'Golden-fried risotto balls infused with black truffle oil and stuffed with melting mozzarella cheese.',
        price: 850,
        currency: 'Rs.',
        tags: ['vegetarian', 'cheesy', 'crispy', 'appetizer'],
        ingredients: ['arborio rice', 'mozzarella', 'parmesan', 'black truffle oil', 'breadcrumbs'],
        attributes: { Spiciness: 'None', Calories: '460 kcal', PrepTime: '10 mins' },
        isAvailable: true
    },

    // --- KIDS & STARTERS ---
    {
        categoryName: 'Kids & Starters',
        name: 'Crispy Chicken Tenders & Fries',
        description: 'Golden breaded chicken breast tenders served with crinkle-cut fries and mild honey mustard dipping sauce.',
        price: 500,
        currency: 'Rs.',
        tags: ['kids', 'child-friendly', 'chicken', 'mild', 'popular'],
        ingredients: ['chicken breast strips', 'potatoes', 'breadcrumbs', 'honey mustard sauce'],
        attributes: { Spiciness: 'None', Calories: '450 kcal', PrepTime: '10 mins' },
        isAvailable: true
    },

    // --- DESSERTS ---
    {
        categoryName: 'Desserts',
        name: 'Decadent Chocolate Lava Cake',
        description: 'Warm Belgian chocolate cake with a rich flowing dark chocolate molten center, served with vanilla bean ice cream.',
        price: 600,
        currency: 'Rs.',
        tags: ['dessert', 'chocolate', 'sweet', 'popular'],
        ingredients: ['dark chocolate', 'butter', 'eggs', 'sugar', 'flour', 'vanilla ice cream'],
        attributes: { Spiciness: 'None', Calories: '540 kcal', PrepTime: '8 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Desserts',
        name: 'Chocolate Fudge Brownie',
        description: 'Rich dense chocolate brownie studded with chocolate chips and drizzled with warm chocolate ganache.',
        price: 500,
        currency: 'Rs.',
        tags: ['dessert', 'chocolate', 'sweet'],
        ingredients: ['cocoa powder', 'chocolate chips', 'butter', 'flour', 'sugar', 'eggs'],
        attributes: { Spiciness: 'None', Calories: '480 kcal', PrepTime: '5 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Desserts',
        name: 'Mango Passionfruit Panna Cotta',
        description: 'Silky vanilla panna cotta crowned with fresh Alphonso mango coulis and tangy passionfruit seeds.',
        price: 550,
        currency: 'Rs.',
        tags: ['dessert', 'fruity', 'sweet', 'light'],
        ingredients: ['cream', 'milk', 'mango puree', 'passionfruit', 'sugar', 'gelatin'],
        attributes: { Spiciness: 'None', Calories: '310 kcal', PrepTime: '5 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Desserts',
        name: 'Classic Sicilian Cannoli',
        description: 'Crispy fried pastry shells filled with sweet ricotta cream, crushed pistachios, and candied orange peel.',
        price: 450,
        currency: 'Rs.',
        tags: ['dessert', 'pastry', 'sweet', 'italian'],
        ingredients: ['pastry shell', 'ricotta cheese', 'sugar', 'pistachios', 'candied orange'],
        attributes: { Spiciness: 'None', Calories: '340 kcal', PrepTime: '5 mins' },
        isAvailable: true
    },

    // --- BEVERAGES ---
    {
        categoryName: 'Beverages',
        name: 'Fresh Mint Lemonade',
        description: 'Zesty freshly squeezed lemon juice blended with garden mint leaves, chilled sparkling water, and raw cane sugar.',
        price: 250,
        currency: 'Rs.',
        tags: ['beverage', 'drink', 'refreshing', 'cold', 'vegan'],
        ingredients: ['lemon juice', 'fresh mint', 'sparkling water', 'cane sugar'],
        attributes: { Spiciness: 'None', Calories: '80 kcal', PrepTime: '3 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Beverages',
        name: 'Iced Peach Tea',
        description: 'Slow-brewed black tea infused with sweet peach nectar and served over crushed ice.',
        price: 300,
        currency: 'Rs.',
        tags: ['beverage', 'drink', 'iced-tea', 'cold'],
        ingredients: ['black tea', 'peach nectar', 'ice', 'sugar'],
        attributes: { Spiciness: 'None', Calories: '95 kcal', PrepTime: '3 mins' },
        isAvailable: true
    },
    {
        categoryName: 'Beverages',
        name: 'Mineral Water',
        description: 'Pure natural spring water served chilled with a slice of lemon.',
        price: 150,
        currency: 'Rs.',
        tags: ['beverage', 'drink', 'water', 'cheapest'],
        ingredients: ['spring water'],
        attributes: { Spiciness: 'None', Calories: '0 kcal', PrepTime: '1 min' },
        isAvailable: true
    },
    {
        categoryName: 'Beverages',
        name: 'Special Mango Smoothie',
        description: 'Thick creamy smoothie blended with ripe mangoes, Greek yogurt, and honey.',
        price: 400,
        currency: 'Rs.',
        tags: ['beverage', 'drink', 'smoothie', 'healthy'],
        ingredients: ['mango', 'greek yogurt', 'honey', 'milk'],
        attributes: { Spiciness: 'None', Calories: '210 kcal', PrepTime: '5 mins' },
        isAvailable: true
    }
];

async function seedBenchmarkCatalog() {
    console.log('🚀 Seeding Benchmark Catalog without modifying existing data...\n');
    await mongooseConfig.connect();

    try {
        const tenantSlug = 'ai-multilingual-benchmark';
        let tenant = await Tenant.findOne({ slug: tenantSlug });
        if (!tenant) {
            tenant = await Tenant.create({
                name: 'Spice & Sizzle Bistro',
                slug: tenantSlug,
                defaultLanguage: 'en',
                status: 'ACTIVE',
                primaryColor: '#f97316',
                secondaryColor: '#0f172a'
            });
            console.log(`✅ Created test tenant "${tenant.name}" (${tenant._id})`);
        } else {
            console.log(`ℹ️ Found existing test tenant "${tenant.name}" (${tenant._id})`);
        }

        const tenantId = tenant._id.toString();

        let catalog = await Catalog.findOne({ tenantId, name: 'Multilingual Benchmark Menu 2026' });
        if (!catalog) {
            catalog = await Catalog.create({
                tenantId,
                name: 'Multilingual Benchmark Menu 2026',
                description: 'Full restaurant catalog covering burgers, grills, vegetarian, desserts, and drinks with Pakistani/Indian Rupee (Rs.) pricing.',
                status: 'PUBLISHED',
                version: 1
            });
            console.log(`✅ Created Catalog "${catalog.name}" (${catalog._id})`);
        } else {
            catalog.status = 'PUBLISHED';
            await catalog.save();
            console.log(`ℹ️ Found Catalog "${catalog.name}" (${catalog._id})`);
        }

        const catalogId = catalog._id.toString();

        // Create categories
        const categoryNames = ['Burgers', 'Main Courses', 'Salads & Vegetarian', 'Kids & Starters', 'Desserts', 'Beverages'];
        const categoryMap = new Map();

        for (let i = 0; i < categoryNames.length; i++) {
            const catName = categoryNames[i];
            let category = await Category.findOne({ tenantId, catalogId, name: catName });
            if (!category) {
                category = await Category.create({
                    tenantId,
                    catalogId,
                    name: catName,
                    sortOrder: i + 1
                });
            }
            categoryMap.set(catName, category._id);
        }

        // Create items
        console.log(`⏳ Ensuring all ${BENCHMARK_ITEMS.length} items exist with vector embeddings...`);
        for (const itemData of BENCHMARK_ITEMS) {
            const categoryId = categoryMap.get(itemData.categoryName);
            let item = await CatalogItem.findOne({ tenantId, catalogId, name: itemData.name });

            const embeddingText = EmbeddingService.buildItemEmbeddingText(itemData, itemData.categoryName);
            const embeddingHash = EmbeddingService.hashEmbeddingText(embeddingText);

            if (!item) {
                console.log(`   Generating vector for: ${itemData.name}...`);
                const embedding = await EmbeddingService.createEmbedding(embeddingText, tenantId);
                item = await CatalogItem.create({
                    tenantId,
                    catalogId,
                    categoryId,
                    name: itemData.name,
                    description: itemData.description,
                    price: itemData.price,
                    currency: itemData.currency,
                    tags: itemData.tags,
                    ingredients: itemData.ingredients,
                    attributes: itemData.attributes,
                    isAvailable: itemData.isAvailable,
                    embedding,
                    embeddingHash,
                    embeddingVersion: 1
                });
                console.log(`   ✨ Created ${item.name} (Rs. ${item.price})`);
            } else if (!item.embedding || item.embedding.length === 0) {
                console.log(`   Updating vector for: ${item.name}...`);
                const embedding = await EmbeddingService.createEmbedding(embeddingText, tenantId);
                item.embedding = embedding;
                item.embeddingHash = embeddingHash;
                item.embeddingVersion = 1;
                item.currency = itemData.currency;
                item.price = itemData.price;
                item.description = itemData.description;
                item.tags = itemData.tags;
                item.ingredients = itemData.ingredients;
                item.attributes = itemData.attributes;
                await item.save();
                console.log(`   ✨ Updated embedding for ${item.name}`);
            } else {
                console.log(`   ✓ Item exists and embedded: ${item.name}`);
            }
        }

        console.log('\n🎉 Benchmark catalog setup complete!');
        console.log('Tenant ID:', tenantId);
        console.log('Catalog ID:', catalogId);
    } catch (err) {
        console.error('Error during benchmark seeding:', err);
    } finally {
        await mongooseConfig.disconnect();
        process.exit(0);
    }
}

seedBenchmarkCatalog();
