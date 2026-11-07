const mongoose = require('mongoose');
const CatalogItem = require('../../models/CatalogItem');
const Category = require('../../models/Category');
const EmbeddingService = require('./embedding.service');

const { ObjectId } = mongoose.Types;

const RRF_K = 60;
const NUM = '([0-9]+(?:,[0-9]{3})*(?:\\.[0-9]+)?)';
const CURRENCY = '(?:rs\\.?|pkr|rupees?|rupias?|rupie|roupies?|roepies?|卢比|روبية|\\$|usd|bucks?|€|eur|£)';

function cleanNum(val) {
    if (!val) return undefined;
    const clean = String(val).replace(/,/g, '').trim();
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : undefined;
}

const STOP_WORDS = new Set([
    'do', 'we', 'have', 'has', 'had', 'anything', 'any', 'is', 'are', 'was', 'were',
    'the', 'a', 'an', 'for', 'with', 'in', 'on', 'at', 'of', 'to', 'and', 'or', 'but',
    'me', 'my', 'you', 'your', 'i', 'it', 'what', 'which', 'who', 'how', 'show', 'give',
    'get', 'find', 'want', 'need', 'like', 'some', 'something', 'somthing', 'anyting', 'please', 'can', 'could',
    'would', 'should', 'there', 'that', 'this', 'these', 'those', 'item', 'items',
    'thing', 'things', 'option', 'options', 'price', 'priced', 'cost', 'costs',
    'dollar', 'dollars', 'usd', 'bucks', 'budget', 'range', 'only', 'all', 'about',
    'got', 'available', 'offer', 'serve', 'recommend', 'recomended', 'recommendation', 'recommendations', 'suggest',
    'tell', 'menu', 'dish', 'dishes', 'food', 'meal', 'say', 'know', 'list',
    // Dutch stop words
    'hebben', 'heeft', 'jullie', 'iets', 'wat', 'voor', 'met', 'een', 'het', 'graag', 'willen', 'kunt', 'kunnen', 'aanraden', 'van', 'op', 'in', 'aan', 'bij', 'om', 'te', 'er', 'zijn',
    // German stop words
    'haben', 'gibt', 'etwas', 'eine', 'einen', 'können', 'empfehlen', 'von', 'und', 'oder',
    // French stop words
    'avez', 'vous', 'quelque', 'chose', 'pour', 'avec', 'une', 'recommander', 'de', 'du', 'des', 'le', 'la', 'les', 'en', 'dans', 'sur', 'qui', 'que', 'sont', 'est',
    // Spanish stop words
    'tienen', 'algo', 'para', 'con', 'una', 'recomiendas', 'recomendar', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'unos', 'unas', 'por', 'que', 'en', 'es', 'son', 'su',
    // Italian stop words
    'avete', 'cosa', 'per', 'con', 'una', 'uno', 'un', 'il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'da', 'del', 'della', 'delle', 'dei', 'degli', 'in', 'su', 'tra', 'fra', 'che', 'sono'
]);

function stemWord(word) {
    if (!word || typeof word !== 'string') return '';
    const w = word.toLowerCase().trim();
    if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.endsWith('es') && (w.endsWith('ches') || w.endsWith('shes') || w.endsWith('sses') || w.endsWith('xes'))) return w.slice(0, -2);
    if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
}

const CATEGORY_SYNONYMS = {
    appetizer: ['appetizer', 'appetizers', 'starter', 'starters', 'small plate', 'small plates', 'voorgerecht', 'voorgerechten', 'entrée', 'entree', 'vorspeise', 'vorspeisen', 'antipasti', 'antipasto', 'tapas', 'finger food'],
    main: ['main', 'mains', 'main course', 'main courses', 'hoofdgerecht', 'hoofdgerechten', 'plat', 'plats', 'hauptgericht', 'hauptspeise', 'segundo', 'diner'],
    dessert: ['dessert', 'desserts', 'sweet', 'sweets', 'nagerecht', 'nagerechten', 'toetje', 'toetjes', 'nachtisch', 'postre', 'postres', 'dolce', 'dolci', 'cake', 'ice cream', '甜点', '甜品', 'حلويات', 'تحلية'],
    beverage: ['drink', 'drinks', 'beverage', 'beverages', 'drank', 'dranken', 'drankje', 'drankjes', 'cocktail', 'cocktails', 'wine', 'beer', 'coffee', 'tea', 'boisson', 'boissons', 'getränk', 'bebida', 'bebidas', 'bevanda', 'bevande', 'koffie', 'thee', '饮料', '饮品', 'مشروب', 'مشروبات', 'المشروبات'],
    burger: ['burger', 'burgers', 'hamburger', 'hamburgers', 'hamburguesa', 'hamburguesas', '汉堡', '汉堡包', 'برغر', 'برجر'],
    side: ['side', 'sides', 'side dish', 'side dishes', 'bijgerecht', 'bijgerechten', 'beilage', 'guarnición']
};

const MULTILINGUAL_SYNONYMS = {
    chicken: ['chicken', 'pollo', 'poulet', 'kip', 'kipgerechten', '鸡肉', '鸡', 'دجاج', 'الدجاج'],
    cheese: ['cheese', 'cheesy', 'queso', 'fromage', 'formaggio', 'kaas', '奶酪', '芝士', '起司', 'جبن', 'جبنة', 'الجبن'],
    burger: ['burger', 'burgers', 'hamburguesa', 'hamburguesas', 'hamburger', 'hamburgers', '汉堡', '汉堡包', 'برغر', 'برجر'],
    garlic: ['garlic', 'ajo', 'ail', 'aglio', 'knoflook', '大蒜', '蒜', 'ثوم'],
    mayonnaise: ['mayonnaise', 'mayo', 'maionese', 'mayonesa', '蛋黄酱', '美乃滋', 'مايونيز'],
    crispy: ['crispy', 'crunchy', 'crujiente', 'croustillant', 'croquant', 'croccante', 'knapperig', 'krokant', '酥脆', '脆', 'مقرمش', 'مقرمشًا'],
    spicy: ['spicy', 'hot', 'chili', 'chilli', 'pepper', 'picante', 'picantes', 'épicé', 'épicée', 'pimenté', 'piccante', 'piccanti', 'pittig', 'pittige', 'scharf', '辣', '辛辣', 'حار', 'حارة', 'حارًا'],
    halal: ['halal', 'halal-certified', 'halal certified', 'certified halal', 'حلال', '清真']
};

const SPICY_PATTERN = /\b(spicy|hot|chili|chilli|pepper|peppery|spiciness|spiced|pittig|pittige|scharf|scharfe|épicé|épicée|picante|picantes|辣|辛辣|حار|حارة|حارًا)\b/i;
const CRISPY_PATTERN = /\b(crispy|crunchy|crujiente|croustillant|croquant|croccante|knapperig|krokant|酥脆|脆|مقرمش|مقرمشًا)\b/i;

function matchCategoryIds(rawQuery, categories = []) {
    if (!rawQuery || !categories || categories.length === 0) return [];
    const lower = String(rawQuery).toLowerCase();
    const matched = [];

    for (const cat of categories) {
        const catNameLower = (cat.name || '').toLowerCase();
        const catWords = catNameLower.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
        const hasDirectMatch = catWords.some((w) => lower.includes(w) || (stemWord(w) && lower.includes(stemWord(w))));
        if (hasDirectMatch) {
            matched.push(cat._id);
            continue;
        }

        for (const [, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
            const catMatchesSynonym = synonyms.some((s) => catNameLower.includes(s));
            const queryMatchesSynonym = synonyms.some((s) => new RegExp(`(?:^|[^a-z0-9])${escapeRegex(s)}(?:$|[^a-z0-9])`, 'i').test(lower));
            if (catMatchesSynonym && queryMatchesSynonym) {
                matched.push(cat._id);
                break;
            }
        }
    }

    return matched;
}

// Tag-style intents worth turning into hard filters rather than trusting to similarity.
const TAG_INTENTS = [
    { pattern: /\b(vegetarian|veggie|vegetariano|vegetariana|vegetariani|vegetariane|végétarien|végétarienne|vegetarisch|vegetarische|素食|素菜|全素|نباتي|نباتية)\b/i, tag: 'vegetarian' },
    { pattern: /\b(vegan|vegano|vegana|végan|végane|veganistisch|纯素|نباتي صرف)\b/i, tag: 'vegan' },
    { pattern: /\b(gluten[\s-]?free|sin[\s-]gluten|sans[\s-]gluten|senza[\s-]glutine|glutenvrij|glutenvrije|无麸质|خال من الغلوتين)\b/i, tag: 'gluten-free' },
    { pattern: /\b(halal(-certified)?|certified[\s-]halal|حلال|清真)\b/i, tag: 'halal' },
    { pattern: /\b(popular|best[\s-]?sell(?:er|ing)|most ordered|populaire|popolare|populair|热门|الأكثر طلبا)\b/i, tag: 'popular' },
    { pattern: /\b(chef'?s? special|signature|spécialité|speciale del cuoco|chef-special)\b/i, tag: 'chef-special' },
    { pattern: /\b(?:tagged\s+as\s+)?(grilled|grill|parrilla|grillé|gegrild|grigliato|烤|مشوي)\b/i, tag: 'grilled' },
    { pattern: /\b(child|children|kid|kids|enfant|enfants|bambino|bambini|kind|kinderen|儿童|어린이|طفل|أطفال)\b/i, tag: 'kids' }
];

const EXCLUSION_PATTERNS = [
    {
        pattern: /(?:no|without|except|free(?:\s+from)?|sans|sin|senza|zonder|不含|不要|免|无|بدون|دون|خالٍ?\s+من|باستثناء)\s*(?:any\s+)?(?:dairy|milk|lactose|lácteos|produits\s+laitiers|latticini|zuivel|乳制品|الألبان)/i,
        keywords: ['dairy', 'milk', 'cheese', 'butter', 'cream', 'yogurt', 'paneer', 'ricotta', 'mozzarella', 'parmesan']
    },
    {
        pattern: /(?:no|without|except|but\s+not|sans|sin|senza|zonder|不要|不含|无|بدون|دون|باستثناء)\s*(?:any\s+)?(?:cheese|queso|fromage|formaggio|kaas|奶酪|芝士|起司|الجبن|جبن|جبنة)/i,
        keywords: ['cheese', 'cheddar', 'mozzarella', 'parmesan', 'ricotta', 'fontina', 'gorgonzola', 'queso', 'fromage', 'formaggio', 'kaas', '奶酪', '芝士']
    },
    {
        pattern: /(?:no|without|except|but\s+not|other\s+than|sans|sin|senza|behalve|除了|不含|免|بدون|باستثناء)\s*(?:any\s+)?(?:chocolate|chocolate-based|chocolat|cioccolato|chocolade|巧克力|الشوكولاتة)/i,
        keywords: ['chocolate', 'cocoa', 'fudge', 'chocolat', 'cioccolato', 'chocolade', '巧克力']
    }
];

const PRICE_PATTERNS = {
    between: [
        new RegExp(`(?:between|from|entre|tra|fra|tussen|بين)\\s*(?:${CURRENCY}\\s*)?${NUM}\\s*(?:${CURRENCY})?\\s*(?:and|to|y|et|e|en|至|到|和|و|-|–)\\s*(?:${CURRENCY}\\s*)?${NUM}\\s*(?:${CURRENCY})?`, 'i'),
        new RegExp(`(?:在)?\\s*(?:${CURRENCY}\\s*)?${NUM}\\s*(?:${CURRENCY})?\\s*(?:和|与|到|至|-|–)\\s*(?:${CURRENCY}\\s*)?${NUM}\\s*(?:${CURRENCY})?\\s*(?:之间)?`, 'i')
    ],
    maxPrefix: new RegExp(`(?:under|below|less than|lower than|cheaper than|up to|at most|max(?:imum)?|within|no more than|not more than|menos de|menor(?:es)? a|por debajo de|hasta|moins de|inférieur(?:e)? à|inferieur(?:e)? a|au plus|jusqu'à|jusqu'a|meno di|inferiore a|fino a|minder dan|minder als|onder(?: de)?|tot|低于|不超过|小于|以下|以内|أقل من|اقل من|يقل سعرها عن|بسعر أقل من|في حدود)\\s*(?:${CURRENCY}\\s*)?${NUM}`, 'i'),
    maxSuffix: new RegExp(`(?:${CURRENCY}\\s*)?${NUM}\\s*(?:${CURRENCY})?\\s*(?:or less|or under|or below|or cheaper|o menos|ou moins|o meno|of minder|以下|以内|أو أقل|او اقل)`, 'i'),
    minPrefix: new RegExp(`(?:over|above|more than|greater than|at least|starting (?:at|from)|min(?:imum)?|más de|mas de|mayor(?:es)? a|por encima de|al menos|desde|plus de|supérieur(?:e)? à|superieur(?:e)? a|au moins|à partir de|a partir de|più di|piu di|superiore a|almeno|a partire da|meer dan|boven(?: de)?|minstens|vanaf|高于|(?:(?<!不)超过)|大于|以上|起|أكثر من|اكثر من|يزيد عن|على الأقل|بدءا من)\\s*(?:${CURRENCY}\\s*)?${NUM}`, 'i'),
    minSuffix: new RegExp(`(?:${CURRENCY}\\s*)?${NUM}\\s*(?:${CURRENCY})?\\s*(?:or more|or above|and up|o más|o mas|ou plus|o GUI|o piu|of meer|以上|起|أو أكثر|او اكثر)`, 'i')
};

const PROJECTION = {
    name: 1,
    description: 1,
    price: 1,
    currency: 1,
    categoryId: 1,
    categoryName: 1,
    catalogId: 1,
    image: 1,
    tags: 1,
    attributes: 1,
    ingredients: 1,
    isAvailable: 1
};

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ *
 * 1. Query parsing — separate constraints from concepts
 * ------------------------------------------------------------------ */

function parseQuery(rawQuery = '') {
    let residual = String(rawQuery).toLowerCase();
    const constraints = {};

    for (const b of PRICE_PATTERNS.between) {
        const m = residual.match(b);
        if (m) {
            constraints.minPrice = Math.min(cleanNum(m[1]), cleanNum(m[2]));
            constraints.maxPrice = Math.max(cleanNum(m[1]), cleanNum(m[2]));
            residual = residual.replace(b, ' ');
            break;
        }
    }

    if (constraints.maxPrice === undefined) {
        const mMax = residual.match(PRICE_PATTERNS.maxPrefix) || residual.match(PRICE_PATTERNS.maxSuffix);
        if (mMax) {
            constraints.maxPrice = cleanNum(mMax[1]);
            residual = residual.replace(mMax[0], ' ');
        }
    }

    if (constraints.minPrice === undefined) {
        const mMin = residual.match(PRICE_PATTERNS.minPrefix) || residual.match(PRICE_PATTERNS.minSuffix);
        if (mMin) {
            constraints.minPrice = cleanNum(mMin[1]);
            residual = residual.replace(mMin[0], ' ');
        }
    }

    // Dietary / tag intents become hard filters.
    const requiredTags = [];
    for (const { pattern, tag } of TAG_INTENTS) {
        if (pattern.test(residual)) requiredTags.push(tag);
    }
    if (requiredTags.length) constraints.requiredTags = requiredTags;

    if (SPICY_PATTERN.test(residual)) {
        constraints.isSpicy = true;
    }
    if (CRISPY_PATTERN.test(residual)) {
        constraints.isCrispy = true;
    }

    // Exclusions (e.g. no dairy, without cheese, except chocolate)
    const excludeKeywords = [];
    for (const ep of EXCLUSION_PATTERNS) {
        if (ep.pattern.test(rawQuery)) {
            excludeKeywords.push(...ep.keywords);
        }
    }
    if (excludeKeywords.length) {
        constraints.excludeKeywords = excludeKeywords;
    }

    // Multilingual sorting
    const cheapestPattern = /\b(cheapest|lowest priced|least expensive|más barato|mas barato|el más económico|el mas economico|le moins cher|le plus abordable|il più economico|il piu economico|il meno caro|goedkoopste|minst dure|最便宜|最低价|أرخص|ارخص)\b/i;
    const mostExpPattern = /\b(most expensive|priciest|highest priced|más caro|mas caro|el más costoso|le plus cher|le plus coûteux|il più costoso|il piu costoso|il più caro|duurste|meest dure|最贵|最高价|أغلى|اغلى)\b/i;

    if (cheapestPattern.test(residual)) {
        constraints.sortBy = 'price_asc';
        residual = residual.replace(cheapestPattern, ' ');
    } else if (mostExpPattern.test(residual)) {
        constraints.sortBy = 'price_desc';
        residual = residual.replace(mostExpPattern, ' ');
    }

    residual = residual.replace(new RegExp(`(?:${CURRENCY})?\\s*\\d+(?:,\\d{3})*(?:\\.\\d+)?`, 'gi'), ' ');

    const keywords = residual
        .replace(/[^a-z0-9\u4e00-\u9fa5\u0600-\u06ff\s-]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

    const GENERAL_MENU_PATTERN = /\b(what dishes do you have|what do you have on your menu|what is on the menu|show me your menu|show me the menu|what dishes are on the menu|what dishes are available|qué platos tienen en su menú|qué platos tienen|quels plats proposez-vous|quali piatti sono presenti|welke gerechten staan er op jullie menu|welke gerechten staan er|ما هي الأطباق الموجودة في قائمتكم|ما هي الأطباق الموجودة|你们的菜单上有哪些菜品|菜单上有哪些菜品|你们有哪些菜品|show me dishes with their prices)\b/i;
    const isGeneralMenu = GENERAL_MENU_PATTERN.test(rawQuery);

    const GENERIC_QUERY_WORDS = new Set([
        'dish', 'dishes', 'item', 'items', 'option', 'options', 'cost', 'costs', 'priced',
        'tell', 'menu', 'food', 'meal', 'about', 'show', 'list', 'certified', 'certification', 'certifications',
        'plato', 'platos', 'cuestan', 'precio', 'precios', 'menú', 'menu',
        'quali', 'piatto', 'piatti', 'costano', 'prezzo',
        'quels', 'plat', 'plats', 'coutent', 'coûtent', 'prix',
        'welke', 'gerecht', 'gerechten', 'kosten', 'prijs',
        '菜', '菜品', '价格', '多少钱', '菜单',
        'ما', 'هي', 'الأطباق', 'الاطباق', 'سعر', 'سعرها', 'تكلفة', 'قائمة'
    ]);
    const significantKeywords = keywords.filter((w) => !GENERIC_QUERY_WORDS.has(w));
    const isPureConstraint = (significantKeywords.length === 0 && Object.keys(constraints).length > 0) || isGeneralMenu;

    return {
        rawQuery,
        constraints,
        keywords: significantKeywords,
        isGeneralMenu,
        semanticQuery: significantKeywords.join(' ') || rawQuery,
        // "anything under $10" — constraints, but nothing to match on semantically.
        isPureConstraint
    };
}

/* ------------------------------------------------------------------ *
 * 2. Filter construction — one source of truth for every path
 * ------------------------------------------------------------------ */

function buildFilter({ tenantId, catalogId, constraints }) {
    const filter = {
        tenantId: new ObjectId(tenantId),
        isAvailable: true
    };

    if (catalogId) filter.catalogId = new ObjectId(catalogId);
    if (constraints.categoryId) filter.categoryId = new ObjectId(constraints.categoryId);

    const price = {};
    if (constraints.maxPrice !== undefined) price.$lte = Number(constraints.maxPrice);
    if (constraints.minPrice !== undefined) price.$gte = Number(constraints.minPrice);
    if (Object.keys(price).length) filter.price = price;

    if (constraints.requiredTags?.length) {
        const tagRegexes = constraints.requiredTags.map((t) => new RegExp(`^${escapeRegex(t)}$`, 'i'));
        filter.$or = [
            { tags: { $in: tagRegexes } },
            { 'attributes.dietaryTags': { $in: tagRegexes } }
        ];
    }

    return filter;
}

function stemOrPluralRegex(term) {
    const t = escapeRegex(term.toLowerCase().trim());
    return new RegExp(`\\b${t}s?\\b|${t}`, 'i');
}

function violatesConstraints(item, constraints) {
    if (constraints.maxPrice !== undefined && !(item.price <= constraints.maxPrice)) return true;
    if (constraints.minPrice !== undefined && !(item.price >= constraints.minPrice)) return true;

    if (constraints.requiredTags?.length) {
        const allTags = [
            ...(item.tags || []),
            ...(item.attributes?.dietaryTags || [])
        ].map((t) => String(t).toLowerCase());
        if (!constraints.requiredTags.every((t) => allTags.some((at) => at.includes(t.toLowerCase())))) return true;
    }

    const itemText = `${item.name} ${item.description || ''} ${(item.ingredients || []).join(' ')} ${(item.tags || []).join(' ')} ${JSON.stringify(item.attributes || {})}`.toLowerCase();

    // Must NOT contain excluded keywords / ingredients
    if (constraints.excludeKeywords?.length) {
        for (const ex of constraints.excludeKeywords) {
            const exRegex = stemOrPluralRegex(ex);
            if (exRegex.test(itemText)) return true;
        }
    }

    // Must contain required ingredients
    if (constraints.mustContainIngredients?.length) {
        for (const inc of constraints.mustContainIngredients) {
            const incRegex = stemOrPluralRegex(inc);
            if (!incRegex.test(itemText)) return true;
        }
    }

    return false;
}

/* ------------------------------------------------------------------ *
 * 3. Retrieval
 * ------------------------------------------------------------------ */

class RetrievalService {
    static async retrieveRelevantItems({ tenantId, catalogId, query, limit, filters = {}, extracted = null }) {
        const envLimit = parseInt(process.env.AI_MAX_RETRIEVAL_RESULTS || '', 10);
        const finalLimit = Number(limit) || (Number.isFinite(envLimit) ? envLimit : 6);
        const minSimilarity = parseFloat(process.env.AI_SIMILARITY_THRESHOLD || '0.65');

        const parsed = parseQuery(query);

        // Merge high-precision extracted features from QueryExtractorService if available
        if (extracted) {
            if (extracted.cleanSearchQuery) {
                parsed.cleanSearchQuery = extracted.cleanSearchQuery;
                parsed.semanticQuery = extracted.cleanSearchQuery;
                parsed.keywords = extracted.cleanSearchQuery
                    .toLowerCase()
                    .replace(/[^a-z0-9\u4e00-\u9fa5\u0600-\u06ff\s-]/gi, ' ')
                    .split(/\s+/)
                    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
            }
            if (extracted.intent === 'general_menu') {
                parsed.isGeneralMenu = true;
                parsed.isPureConstraint = true;
            } else if (extracted.intent === 'dish_inquiry' || extracted.intent === 'recommendation') {
                parsed.isGeneralMenu = false;
                parsed.isPureConstraint = false;
            }
            if (extracted.mustContainIngredients?.length || extracted.mustNotContainIngredients?.length || extracted.dietaryTags?.length) {
                parsed.isGeneralMenu = false;
                parsed.isPureConstraint = false;
            }
            if (extracted.mustNotContainIngredients?.length) {
                parsed.constraints.excludeKeywords = [
                    ...(parsed.constraints.excludeKeywords || []),
                    ...extracted.mustNotContainIngredients
                ];
            }
            if (extracted.mustContainIngredients?.length) {
                parsed.constraints.mustContainIngredients = [
                    ...(parsed.constraints.mustContainIngredients || []),
                    ...extracted.mustContainIngredients
                ];
            }
            if (extracted.dietaryTags?.length) {
                parsed.constraints.requiredTags = [
                    ...(parsed.constraints.requiredTags || []),
                    ...extracted.dietaryTags
                ];
            }
            if (extracted.maxPrice !== null && extracted.maxPrice !== undefined) {
                parsed.constraints.maxPrice = extracted.maxPrice;
            }
            if (extracted.minPrice !== null && extracted.minPrice !== undefined) {
                parsed.constraints.minPrice = extracted.minPrice;
            }
            if (extracted.sortBy) {
                parsed.constraints.sortBy = extracted.sortBy;
            }
            if (extracted.originalMaxPrice) {
                parsed.constraints.originalMaxPrice = extracted.originalMaxPrice;
            }
            if (extracted.priceCurrency) {
                parsed.constraints.priceCurrency = extracted.priceCurrency;
            }
        }

        // Match categories belonging to this catalog to resolve category requests (e.g. appetizers, drinks)
        const categories = catalogId ? await Category.find({ catalogId, tenantId }).lean() : [];
        const matchedCategoryIds = matchCategoryIds(query, categories);

        // Caller-supplied filters always win over anything inferred from text.
        const constraints = { ...parsed.constraints, ...filters };
        const mongoFilter = buildFilter({ tenantId, catalogId, constraints });

        // --- General Menu / Pure constraint: browse, don't search ---
        if (parsed.isGeneralMenu) {
            const docs = await CatalogItem.find(mongoFilter, PROJECTION)
                .sort({ sortOrder: 1, price: 1 })
                .limit(finalLimit * 2)
                .lean();

            const items = docs.filter((i) => !violatesConstraints(i, constraints));

            return {
                items: items.map((i) => ({ ...i, score: 1, matchedBy: ['general-menu'] })),
                count: items.length,
                constraints,
                relaxedConstraints: false,
                strategy: 'structured',
                minSimilarityScore: minSimilarity
            };
        }

        if (parsed.isPureConstraint && !constraints.mustContainIngredients?.length) {
            const sort = constraints.sortBy === 'price_desc'
                ? { price: -1, sortOrder: 1 }
                : { price: 1, sortOrder: 1 };

            const items = await CatalogItem.find(mongoFilter, PROJECTION)
                .sort(sort)
                .limit(finalLimit)
                .lean();

            return {
                items: items.map((i) => ({ ...i, score: 1, matchedBy: ['constraint'] })),
                count: items.length,
                constraints,
                relaxedConstraints: false,
                strategy: 'structured',
                minSimilarityScore: minSimilarity
            };
        }

        // --- Hybrid: vector + keyword, fused ------------------------
        const [vectorHits, keywordHits] = await Promise.all([
            this._vectorSearch({ parsed, mongoFilter, tenantId, limit: finalLimit, minSimilarity }),
            this._keywordSearch({ parsed, mongoFilter, limit: finalLimit, matchedCategoryIds, constraints })
        ]);

        let items = this._fuse(vectorHits, keywordHits, finalLimit);

        // Nothing matched semantically, but the constraints or categories still narrow usefully.
        if (items.length === 0 && (Object.keys(constraints).length > 0 || matchedCategoryIds.length > 0)) {
            const fallbackFilter = { ...mongoFilter };
            if (matchedCategoryIds.length > 0 && !fallbackFilter.categoryId) {
                fallbackFilter.categoryId = { $in: matchedCategoryIds };
            }

            const fallback = await CatalogItem.find(fallbackFilter, PROJECTION)
                .sort({ price: 1 })
                .limit(finalLimit)
                .lean();
            items = fallback.map((i) => ({ ...i, score: 0.5, matchedBy: ['category-fallback'] }));
        }

        // Hard guard. Nothing violating a constraint reaches the LLM
        items = items.filter((item) => !violatesConstraints(item, constraints));

        let relaxedConstraints = false;
        let relaxedReason = null;

        // Defensive Relaxation: if 0 items remain after strict constraints, gracefully relax
        if (items.length === 0) {
            // 1. If maxPrice was set, try relaxing price ceiling first
            if (constraints.maxPrice !== undefined) {
                const priceRelaxedConstraints = { ...constraints };
                delete priceRelaxedConstraints.maxPrice;
                delete priceRelaxedConstraints.minPrice;
                const priceRelaxedFilter = buildFilter({ tenantId, catalogId, constraints: priceRelaxedConstraints });

                const [relVectorHits, relKeywordHits] = await Promise.all([
                    this._vectorSearch({ parsed, mongoFilter: priceRelaxedFilter, tenantId, limit: finalLimit, minSimilarity: 0.5 }),
                    this._keywordSearch({ parsed, mongoFilter: priceRelaxedFilter, limit: finalLimit, matchedCategoryIds, constraints: priceRelaxedConstraints })
                ]);
                let relItems = this._fuse(relVectorHits, relKeywordHits, finalLimit);
                if (relItems.length === 0) {
                    relItems = await CatalogItem.find(priceRelaxedFilter, PROJECTION).sort({ price: 1 }).limit(finalLimit).lean();
                }
                relItems = relItems.filter((i) => !violatesConstraints(i, priceRelaxedConstraints));
                if (relItems.length > 0) {
                    items = relItems;
                    relaxedConstraints = true;
                    relaxedReason = 'PRICE_RELAXED';
                }
            }

            // 2. If still 0 and ingredient inclusions/exclusions were set, find nearest dishes without strict ingredient bounds
            if (items.length === 0 && (constraints.mustContainIngredients?.length || constraints.excludeKeywords?.length)) {
                const ingRelaxedConstraints = { ...constraints };
                delete ingRelaxedConstraints.mustContainIngredients;
                delete ingRelaxedConstraints.excludeKeywords;
                const ingRelaxedFilter = buildFilter({ tenantId, catalogId, constraints: ingRelaxedConstraints });

                const [relVectorHits, relKeywordHits] = await Promise.all([
                    this._vectorSearch({ parsed, mongoFilter: ingRelaxedFilter, tenantId, limit: finalLimit, minSimilarity: 0.5 }),
                    this._keywordSearch({ parsed, mongoFilter: ingRelaxedFilter, limit: finalLimit, matchedCategoryIds, constraints: ingRelaxedConstraints })
                ]);
                let relItems = this._fuse(relVectorHits, relKeywordHits, finalLimit);
                if (relItems.length === 0) {
                    relItems = await CatalogItem.find(ingRelaxedFilter, PROJECTION).sort({ sortOrder: 1, price: 1 }).limit(finalLimit).lean();
                }
                if (relItems.length > 0) {
                    items = relItems;
                    relaxedConstraints = true;
                    relaxedReason = 'INGREDIENTS_RELAXED';
                }
            }
        }

        if (constraints.sortBy === 'price_asc') items.sort((a, b) => a.price - b.price);
        else if (constraints.sortBy === 'price_desc') items.sort((a, b) => b.price - a.price);

        return {
            items: items.slice(0, finalLimit),
            count: Math.min(items.length, finalLimit),
            constraints,
            relaxedConstraints,
            relaxedReason,
            strategy: 'hybrid',
            minSimilarityScore: minSimilarity
        };
    }

    static async _vectorSearch({ parsed, mongoFilter, tenantId, limit, minSimilarity }) {
        let queryEmbedding;
        try {
            queryEmbedding = await EmbeddingService.createEmbedding(parsed.semanticQuery, tenantId);
        } catch (err) {
            console.warn('[retrieval] embedding failed:', err.message);
            return [];
        }
        if (!queryEmbedding?.length) return [];

        if (mongoFilter.price || mongoFilter.tags || mongoFilter.categoryId || mongoFilter.$or) {
            return this._inMemoryVectorSearch({ mongoFilter, queryEmbedding, limit, minSimilarity });
        }

        try {
            const results = await CatalogItem.aggregate([
                {
                    $vectorSearch: {
                        index: 'vector_index',
                        path: 'embedding',
                        queryVector: queryEmbedding,
                        numCandidates: Math.max(200, limit * 20),
                        limit: limit * 3,
                        filter: mongoFilter
                    }
                },
                { $project: { ...PROJECTION, score: { $meta: 'vectorSearchScore' } } }
            ]);

            const valid = results.filter((r) => (r.score ?? 0) >= minSimilarity);
            if (valid.length > 0) {
                return valid;
            }

            // Fallback to in-memory cosine search if Atlas index returned 0 results
            return this._inMemoryVectorSearch({ mongoFilter, queryEmbedding, limit, minSimilarity });
        } catch (err) {
            console.warn('[retrieval] $vectorSearch unavailable:', err.message);
            return this._inMemoryVectorSearch({ mongoFilter, queryEmbedding, limit, minSimilarity });
        }
    }

    static async _inMemoryVectorSearch({ mongoFilter, queryEmbedding, limit, minSimilarity }) {
        // embedding is select:false — request it explicitly here.
        const docs = await CatalogItem.find(mongoFilter)
            .select({ ...PROJECTION, embedding: 1 })
            .limit(2000)
            .lean();

        return docs
            .filter((d) => Array.isArray(d.embedding) && d.embedding.length)
            .map(({ embedding, ...rest }) => {
                const raw = RetrievalService.cosineSimilarity(queryEmbedding, embedding);
                // Normalise to Atlas's 0..1 cosine scale so one threshold works everywhere.
                return { ...rest, score: (raw + 1) / 2 };
            })
            .filter((d) => d.score >= minSimilarity)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit * 3);
    }

    static async _keywordSearch({ parsed, mongoFilter, limit, matchedCategoryIds = [], constraints = {} }) {
        const hasKeywords = parsed.keywords && parsed.keywords.length > 0;
        const hasCategories = matchedCategoryIds && matchedCategoryIds.length > 0;
        const isSpicy = !!parsed.constraints?.isSpicy;
        const hasMustContain = constraints.mustContainIngredients && constraints.mustContainIngredients.length > 0;

        if (!hasKeywords && !hasCategories && !isSpicy && !hasMustContain) return [];

        if (hasKeywords) {
            try {
                const results = await CatalogItem.find(
                    { ...mongoFilter, $text: { $search: parsed.keywords.join(' ') } },
                    { ...PROJECTION, textScore: { $meta: 'textScore' } }
                )
                    .sort({ textScore: { $meta: 'textScore' } })
                    .limit(limit * 3)
                    .lean();

                if (results.length) return results;
            } catch (err) {
                // No text index yet — fall through to regex.
            }
        }

        const regexes = [];
        if (hasKeywords) {
            for (const w of parsed.keywords) {
                const stem = stemWord(w);
                regexes.push(new RegExp(`\\b${escapeRegex(w)}\\b`, 'i'));
                if (stem && stem !== w && stem.length > 2) {
                    regexes.push(new RegExp(`\\b${escapeRegex(stem)}\\b`, 'i'));
                }
            }
        }

        if (hasMustContain) {
            for (const inc of constraints.mustContainIngredients) {
                regexes.push(new RegExp(`\\b${escapeRegex(inc)}`, 'i'));
            }
        }

        if (hasKeywords || parsed.rawQuery) {
            const rawQ = String(parsed.rawQuery || '').toLowerCase();
            for (const [englishTerm, synList] of Object.entries(MULTILINGUAL_SYNONYMS)) {
                const matchesAny = (parsed.keywords || []).some((w) => synList.includes(w)) ||
                                   synList.some((s) => rawQ.includes(s));
                if (matchesAny) {
                    regexes.push(new RegExp(`\\b${escapeRegex(englishTerm)}\\b`, 'i'));
                }
            }
        }

        const orClauses = [];
        if (regexes.length > 0) {
            for (const r of regexes) {
                orClauses.push({ name: { $regex: r } });
                orClauses.push({ description: { $regex: r } });
                orClauses.push({ tags: { $regex: r } });
                orClauses.push({ ingredients: { $regex: r } });
            }
        }

        if (hasCategories) {
            orClauses.push({ categoryId: { $in: matchedCategoryIds } });
        }

        if (isSpicy) {
            const spicyRegex = /spicy|chili|chilli|piri|hot|pittig|scharf|picante/i;
            orClauses.push(
                { name: { $regex: spicyRegex } },
                { description: { $regex: spicyRegex } },
                { tags: { $in: ['spicy', 'hot', 'chili'] } },
                { 'attributes.Spiciness': { $exists: true, $nin: ['None', 'none', 'No', null, ''] } },
                { 'attributes.spiciness': { $exists: true, $nin: ['None', 'none', 'No', null, ''] } },
                { 'attributes.longerStory': { $regex: spicyRegex } }
            );
        }

        if (orClauses.length === 0) return [];

        let query;
        if (mongoFilter.$or) {
            const { $or: tagOr, ...restFilter } = mongoFilter;
            query = {
                ...restFilter,
                $and: [
                    { $or: tagOr },
                    { $or: orClauses }
                ]
            };
        } else {
            query = {
                ...mongoFilter,
                $or: orClauses
            };
        }

        return CatalogItem.find(query, PROJECTION)
            .limit(limit * 3)
            .lean();
    }

    /**
     * Reciprocal Rank Fusion. Combines the two rankings by position rather than
     * score, which sidesteps the fact that cosine similarity and textScore live
     * on completely different scales.
     */
    static _fuse(vectorHits, keywordHits, limit) {
        const merged = new Map();

        const absorb = (list, label) => {
            list.forEach((item, idx) => {
                const key = String(item._id);
                const contribution = 1 / (RRF_K + idx + 1);
                if (merged.has(key)) {
                    const existing = merged.get(key);
                    existing.score += contribution;
                    existing.matchedBy.push(label);
                } else {
                    merged.set(key, {
                        ...item,
                        score: contribution,
                        vectorScore: label === 'vector' ? item.score : undefined,
                        matchedBy: [label]
                    });
                }
            });
        };

        absorb(vectorHits, 'vector');
        absorb(keywordHits, 'keyword');

        return Array.from(merged.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, limit * 2);
    }

    static cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}

module.exports = RetrievalService;
module.exports.parseQuery = parseQuery;
module.exports.buildFilter = buildFilter;