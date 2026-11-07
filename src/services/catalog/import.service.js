const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const mammoth = require('mammoth');
const axios = require('axios');
const OpenAI = require('openai');
const { parse: parseCsv } = require('csv-parse/sync');

const Category = require('../../models/Category');
const CatalogItem = require('../../models/CatalogItem');
const Catalog = require('../../models/Catalog');
const CostService = require('../ai/cost.service');

const SPREADSHEET_ALIASES = {
    name: [
        'name', 'dish', 'dishname', 'item', 'itemname', 'product', 'productname',
        'title', 'naam', 'gerecht', 'food', 'fooditem', 'dishes', 'menuitem',
        'article', 'artikel', 'itemdescription', 'plu', 'recept', 'omschrijving'
    ],
    category: [
        'category', 'categoryname', 'menucategory', 'section', 'group', 'course',
        'categorie', 'gang', 'rubriek', 'type', 'header', 'department', 'afdeling',
        'groep', 'menugroep', 'soort'
    ],
    price: [
        'price', 'prijs', 'cost', 'amount', 'rate', 'pricing', 'unitprice',
        'priceeur', 'priceusd', 'bedrag', 'tarief', 'salesprice', 'verkoopprijs',
        'netprice', 'brutoprijs', 'kosten'
    ],
    description: [
        'description', 'desc', 'details', 'summary', 'notes', 'beschrijving',
        'toelichting', 'story', 'info', 'explanation', 'omschrijvinglang',
        'ingrediëntenlijst', 'serveerwijze'
    ],
    tags: [
        'tags', 'dietarytags', 'dietary', 'dieet', 'diet', 'labels', 'lifestyle',
        'dieetwensen', 'kenmerken', 'label', 'keurmerk'
    ],
    allergens: [
        'allergens', 'allergies', 'allergen', 'allergieen', 'allergenen',
        'allergenieen', 'allergy', 'allergeneninfo'
    ],
    ingredients: [
        'ingredients', 'ingredient', 'ingredienten', 'ingredinten', 'composition',
        'ingrediënten', 'samenstelling', 'bestanddelen'
    ]
};

function normalizeHeaderKey(key) {
    return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findSpreadsheetField(row, aliasList) {
    if (!row || typeof row !== 'object') return undefined;
    for (const [key, val] of Object.entries(row)) {
        const norm = normalizeHeaderKey(key);
        if (aliasList.includes(norm)) {
            return val;
        }
    }
    return undefined;
}

function parseSpreadsheetPrice(val) {
    if (typeof val === 'number') return Math.max(0, val);
    if (!val) return 0;
    const str = String(val).replace(/,/g, '.').replace(/[^0-9.]/g, '');
    return parseFloat(str) || 0;
}

function detectCsvDelimiter(content) {
    const firstLine = (content || '').split('\n')[0] || '';
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;
    if (semicolons > commas && semicolons > tabs) return ';';
    if (tabs > commas && tabs > semicolons) return '\t';
    return ',';
}

class ImportService {
    /**
     * Helper to parse PDF buffer supporting both pdf-parse v1 (function) and v2 (PDFParse class)
     */
    static async parsePdfBuffer(dataBuffer) {
        if (!dataBuffer) return '';
        const pdfModule = require('pdf-parse');
        if (typeof pdfModule === 'function') {
            const data = await pdfModule(dataBuffer);
            return data.text || '';
        } else if (pdfModule && pdfModule.PDFParse) {
            const parser = new pdfModule.PDFParse({ data: dataBuffer });
            const result = await parser.getText();
            await parser.destroy();
            return result.text || '';
        }
        throw new Error('Unsupported pdf-parse module format');
    }

    /**
     * Extracts menu categories & dishes from a web URL or online PDF link using OpenAI.
     */
    static async extractFromLink(url, tenantId) {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            throw new Error('Please provide a valid website or PDF link (starting with http:// or https://)');
        }

        const response = await axios.get(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            responseType: 'arraybuffer',
            timeout: 20000,
            maxContentLength: 20 * 1024 * 1024
        });

        const contentType = (response.headers['content-type'] || '').toLowerCase();

        // Check if link is a direct PDF
        if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
            const dataBuffer = Buffer.from(response.data);
            let text = '';
            try {
                text = await this.parsePdfBuffer(dataBuffer);
            } catch (tErr) {
                console.warn('PDF link text parse failed:', tErr.message);
            }

            if (text && text.trim().length > 120) {
                return await this.extractMenuWithOpenAI({ text, tenantId });
            }

            // Fallback to screenshots for graphical or scanned PDF links
            const pdfModule = require('pdf-parse');
            if (pdfModule && pdfModule.PDFParse) {
                try {
                    const parser = new pdfModule.PDFParse({ data: dataBuffer });
                    const screenshots = await parser.getScreenshot({ scale: 1.5 });
                    await parser.destroy();

                    if (screenshots && Array.isArray(screenshots.pages) && screenshots.pages.length > 0) {
                        const pageImages = screenshots.pages
                            .map((p) => p.dataUrl)
                            .filter(Boolean)
                            .slice(0, 10);

                        if (pageImages.length > 0) {
                            return await this.extractMenuWithOpenAI({ images: pageImages, tenantId });
                        }
                    }
                } catch (screenshotErr) {
                    console.error('PDF link screenshot rendering failed:', screenshotErr.message);
                }
            }

            if (text && text.trim().length > 20) {
                return await this.extractMenuWithOpenAI({ text, tenantId });
            }

            throw new Error('PDF at the provided link does not contain readable text or images.');
        }

        // HTML link: convert buffer to string, strip script/style/tags
        const html = Buffer.from(response.data).toString('utf-8');
        const cleanText = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
            .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
            .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
            .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
            .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim();

        if (cleanText.length < 50) {
            throw new Error('Could not extract sufficient text from the website link. Please try uploading a PDF or photo of the menu.');
        }

        return await this.extractMenuWithOpenAI({ text: cleanText, tenantId });
    }

    /**
     * Extracts menu categories & dishes from an uploaded PDF file.
     */
    static async extractFromPdf(filePath, tenantId) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            let text = '';
            try {
                text = await this.parsePdfBuffer(dataBuffer);
            } catch (tErr) {
                console.warn('PDF text parse attempt failed, trying visual screenshot extraction:', tErr.message);
            }

            // If the PDF contains rich selectable text (> 120 characters), parse with text model
            if (text && text.trim().length > 120) {
                return await this.extractMenuWithOpenAI({ text, tenantId });
            }

            // For image-based, graphical, or scanned PDFs (like Canva or designer exports),
            // render high-res page screenshots and transcribe with OpenAI Vision!
            const pdfModule = require('pdf-parse');
            if (pdfModule && pdfModule.PDFParse) {
                try {
                    const parser = new pdfModule.PDFParse({ data: dataBuffer });
                    const screenshots = await parser.getScreenshot({ scale: 1.5 });
                    await parser.destroy();

                    if (screenshots && Array.isArray(screenshots.pages) && screenshots.pages.length > 0) {
                        const pageImages = screenshots.pages
                            .map((p) => p.dataUrl)
                            .filter(Boolean)
                            .slice(0, 10);

                        if (pageImages.length > 0) {
                            return await this.extractMenuWithOpenAI({ images: pageImages, tenantId });
                        }
                    }
                } catch (screenshotErr) {
                    console.error('PDF screenshot rendering failed:', screenshotErr.message);
                }
            }

            if (text && text.trim().length > 20) {
                return await this.extractMenuWithOpenAI({ text, tenantId });
            }

            throw new Error('Could not extract readable text or page images from the uploaded PDF.');
        } finally {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {}
            }
        }
    }

    /**
     * Extracts menu categories & dishes from uploaded menu photos using OpenAI Vision.
     */
    static async extractFromPhotos(filePaths = [], tenantId) {
        try {
            if (!filePaths || filePaths.length === 0) {
                throw new Error('No photos provided for extraction.');
            }

            const images = filePaths.map((p) => {
                const ext = path.extname(p).toLowerCase().replace('.', '');
                const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
                const base64 = fs.readFileSync(p, { encoding: 'base64' });
                return `data:${mime};base64,${base64}`;
            });

            return await this.extractMenuWithOpenAI({ images, tenantId });
        } finally {
            filePaths.forEach((p) => {
                if (fs.existsSync(p)) {
                    try {
                        fs.unlinkSync(p);
                    } catch (e) {}
                }
            });
        }
    }

    /**
     * Extracts menu categories & dishes from an Excel or CSV spreadsheet.
     */
    static async extractFromSpreadsheet(filePath, tenantId) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            let rawItems = [];

            if (ext === '.csv') {
                rawItems = await this.parseCSV(filePath);
            } else if (ext === '.xlsx' || ext === '.xls') {
                rawItems = await this.parseExcel(filePath);
            } else {
                throw new Error(`Unsupported spreadsheet extension: ${ext}`);
            }

            // If direct heuristic mapping found items, organize by category
            if (rawItems && rawItems.length > 0) {
                const categoryMap = new Map();
                for (const item of rawItems) {
                    if (!item.name || item.name.trim() === '') continue;
                    const catName = (item.category || 'General').trim();
                    if (!categoryMap.has(catName)) {
                        categoryMap.set(catName, []);
                    }

                    categoryMap.get(catName).push({
                        name: item.name.trim(),
                        description: item.description || '',
                        price: typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0,
                        dietaryTags: Array.isArray(item.tags)
                            ? item.tags
                            : typeof item.tags === 'string'
                            ? item.tags.split(',').map((t) => t.trim()).filter(Boolean)
                            : [],
                        allergens: Array.isArray(item.allergens)
                            ? item.allergens
                            : typeof item.allergens === 'string'
                            ? item.allergens.split(',').map((a) => a.trim()).filter(Boolean)
                            : [],
                        ingredients: Array.isArray(item.ingredients)
                            ? item.ingredients
                            : typeof item.ingredients === 'string'
                            ? item.ingredients.split(',').map((i) => i.trim()).filter(Boolean)
                            : []
                    });
                }

                const categories = Array.from(categoryMap.entries()).map(([name, dishes]) => ({
                    name,
                    description: '',
                    dishes
                }));

                if (categories.length > 0) {
                    return {
                        menuName: path.basename(filePath, ext).replace(/[-_]/g, ' ') || 'Spreadsheet Menu',
                        description: 'Imported from spreadsheet',
                        categories
                    };
                }
            }

            // AI Fallback for unstandardized spreadsheets (merged cells, matrix sheets, unstructured text)
            const rawSheetText = this.getWorkbookRawText(filePath);
            if (rawSheetText && rawSheetText.trim().length > 10) {
                return await this.extractMenuWithOpenAI({ text: rawSheetText, tenantId });
            }

            throw new Error('No valid dishes or rows could be extracted from the uploaded spreadsheet.');
        } finally {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (e) {}
            }
        }
    }

    static getWorkbookRawText(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.csv') {
            return fs.readFileSync(filePath, 'utf-8');
        }
        try {
            const wb = xlsx.readFile(filePath);
            const parts = [];
            for (const sheetName of wb.SheetNames) {
                const sheet = wb.Sheets[sheetName];
                const csv = xlsx.utils.sheet_to_csv(sheet);
                if (csv && csv.trim()) {
                    parts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
                }
            }
            return parts.join('\n\n');
        } catch (e) {
            return '';
        }
    }

    /**
     * Core AI extraction logic using OpenAI chat completions (with vision or text).
     */
    static async extractMenuWithOpenAI({ text, images = [], tenantId = null }) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            console.warn('OpenAI API key missing, returning mock extracted menu for preview.');
            return this.getMockExtractedMenu();
        }

        const client = new OpenAI({ apiKey });
        const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

        const systemPrompt = `You are a professional restaurant menu digitizer.
Extract all menu categories, dishes, prices, descriptions, ingredients, dietary tags (e.g. Vegetarian, Vegan, Gluten-Free, Halal, Spicy), and allergens from the provided menu content.
Return ONLY valid JSON matching this exact structure:
{
  "menuName": "Captured Menu Title",
  "description": "Optional brief description",
  "categories": [
    {
      "name": "Category Name (e.g. Voorgerechten, Hoofdgerechten, De Lekkerste Biefstuk, Bijgerechten, Salades, Desserts, Drinks)",
      "description": "Optional category description",
      "dishes": [
        {
          "name": "Dish Name",
          "description": "Dish description",
          "price": 14.50,
          "dietaryTags": ["Vegetarian"],
          "allergens": ["Gluten", "Dairy"],
          "ingredients": ["Tomato", "Basil", "Mozzarella"]
        }
      ]
    }
  ]
}
Special Instructions:
- Support menus in any language (e.g. Dutch, English, French, Spanish, German). Preserve the original language and spelling of dish names and descriptions.
- European decimal notation with commas (e.g. "15,5" or "15,50" or "15.5") must be parsed as a numeric float (15.5).
- If multiple sizes or variations exist (e.g. Small / Klassiek / XL or 150g / 195g), extract the primary dish with base price.
- Look out for vegetarian/vegan indicators (e.g. green leaves or "V" tags) and add to dietaryTags.
- If no prices are stated, set price to 0. Always parse prices as numbers (not strings with currency symbols). Group items logically into categories.`;

        let userContent;
        if (images && images.length > 0) {
            userContent = [
                {
                    type: 'text',
                    text: 'Extract all menu categories and dishes from the attached menu image(s) into the required JSON format. European decimals (e.g. 15,5 or 15.5) should be numeric (15.5). Preserve original language of dish names.'
                },
                ...images.map((img) => ({
                    type: 'image_url',
                    image_url: { url: img }
                }))
            ];
        } else {
            userContent = `Menu content to extract:\n\n${(text || '').slice(0, 35000)}`;
        }

        try {
            const response = await client.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.2,
                max_tokens: 4096
            });

            const parsed = JSON.parse(response.choices[0].message.content);
            console.log(response.choices[0].message);

            if (response.usage && tenantId) {
                await CostService.logUsage({
                    tenantId,
                    model,
                    operation: 'MENU_IMPORT',
                    inputTokens: response.usage.prompt_tokens,
                    outputTokens: response.usage.completion_tokens
                });
            }

            return this.normalizeExtractedMenu(parsed);
        } catch (err) {
            console.error('OpenAI Menu Extraction failed:', err.message);
            return this.getMockExtractedMenu();
        }
    }

    /**
     * Normalizes output structure so categories and dishes always have safe defaults.
     */
    static normalizeExtractedMenu(data) {
        if (!data || typeof data !== 'object') {
            return this.getMockExtractedMenu();
        }

        const menuName = (data.menuName || data.name || 'Imported Menu').trim();
        const description = (data.description || '').trim();
        const rawCategories = Array.isArray(data.categories) ? data.categories : [];

        const categories = rawCategories.map((c) => ({
            name: (c.name || 'General').trim(),
            description: (c.description || '').trim(),
            dishes: (Array.isArray(c.dishes) ? c.dishes : Array.isArray(c.items) ? c.items : [])
                .filter((d) => d && d.name && d.name.trim() !== '')
                .map((d) => ({
                    name: d.name.trim(),
                    description: (d.description || '').trim(),
                    price:
                        typeof d.price === 'number'
                            ? Math.max(0, d.price)
                            : parseFloat(String(d.price).replace(/,/g, '.').replace(/[^0-9.]/g, '')) || 0,
                    dietaryTags: Array.isArray(d.dietaryTags)
                        ? d.dietaryTags
                        : typeof d.tags === 'string'
                        ? d.tags.split(',').map((t) => t.trim()).filter(Boolean)
                        : [],
                    allergens: Array.isArray(d.allergens)
                        ? d.allergens
                        : typeof d.allergens === 'string'
                        ? d.allergens.split(',').map((a) => a.trim()).filter(Boolean)
                        : [],
                    ingredients: Array.isArray(d.ingredients)
                        ? d.ingredients
                        : typeof d.ingredients === 'string'
                        ? d.ingredients.split(',').map((i) => i.trim()).filter(Boolean)
                        : []
                }))
        })).filter((c) => c.dishes.length > 0 || c.name);

        return {
            menuName,
            description,
            categories: categories.length > 0 ? categories : this.getMockExtractedMenu().categories
        };
    }

    /**
     * Persists drafted/reviewed menu into MongoDB: creates Catalog, Categories, and CatalogItems.
     */
    static async saveImportedMenu(tenantId, { menuName, description = '', categories = [] }) {
        if (!categories || categories.length === 0) {
            throw new Error('No categories or dishes provided to save.');
        }

        // 1. Create Catalog
        const catalog = await Catalog.create({
            tenantId,
            name: menuName ? menuName.trim() : 'Imported Menu',
            description: description ? description.trim() : '',
            status: 'DRAFT',
            version: 1
        });

        let totalDishes = 0;

        // 2. Iterate categories and dishes
        for (let cIdx = 0; cIdx < categories.length; cIdx++) {
            const catData = categories[cIdx];
            if (!catData.name || catData.name.trim() === '') continue;

            const category = await Category.create({
                tenantId,
                catalogId: catalog._id,
                name: catData.name.trim(),
                description: catData.description || '',
                sortOrder: cIdx
            });

            const dishes = catData.dishes || [];
            for (let dIdx = 0; dIdx < dishes.length; dIdx++) {
                const dish = dishes[dIdx];
                if (!dish.name || dish.name.trim() === '') continue;

                await CatalogItem.create({
                    tenantId,
                    catalogId: catalog._id,
                    categoryId: category._id,
                    name: dish.name.trim(),
                    description: dish.description || '',
                    price: typeof dish.price === 'number' ? dish.price : parseFloat(dish.price) || 0,
                    currency: 'USD',
                    sortOrder: dIdx,
                    isAvailable: true,
                    tags: Array.isArray(dish.dietaryTags) ? dish.dietaryTags : [],
                    ingredients: Array.isArray(dish.ingredients) ? dish.ingredients : [],
                    attributes: {
                        longerStory: dish.longerStory || dish.description || '',
                        dietaryTags: Array.isArray(dish.dietaryTags) ? dish.dietaryTags : [],
                        allergens: Array.isArray(dish.allergens) ? dish.allergens : []
                    }
                });
                totalDishes++;
            }
        }

        return {
            catalogId: catalog._id,
            menuName: catalog.name,
            totalCategories: categories.length,
            totalDishes
        };
    }

    static getMockExtractedMenu() {
        return {
            menuName: 'Extracted Restaurant Menu',
            description: 'Captured and digitized with AI Waiter',
            categories: [
                {
                    name: 'Starters & Appetizers',
                    description: 'Small plates to begin your dining experience',
                    dishes: [
                        {
                            name: 'Crispy Calamari',
                            description: 'Lightly battered calamari served with house garlic herb aioli and lemon wedge',
                            price: 14.50,
                            dietaryTags: ['Seafood'],
                            allergens: ['Fish', 'Gluten'],
                            ingredients: ['Calamari', 'Garlic Aioli', 'Lemon']
                        },
                        {
                            name: 'Truffle Bruschetta',
                            description: 'Toasted sourdough with heirloom tomatoes, fresh basil, and white truffle glaze',
                            price: 12.00,
                            dietaryTags: ['Vegetarian'],
                            allergens: ['Gluten'],
                            ingredients: ['Sourdough', 'Tomato', 'Basil', 'Truffle Glaze']
                        }
                    ]
                },
                {
                    name: 'Mains & Specialties',
                    description: 'Chef signature main courses',
                    dishes: [
                        {
                            name: 'Pan-Seared Salmon',
                            description: 'Wild Atlantic salmon fillet with roasted asparagus, crushed baby potatoes, and lemon dill butter',
                            price: 26.00,
                            dietaryTags: ['Gluten-Free', 'High-Protein'],
                            allergens: ['Fish', 'Dairy'],
                            ingredients: ['Salmon', 'Asparagus', 'Potatoes', 'Lemon Butter']
                        },
                        {
                            name: 'Ribeye Steak (10oz)',
                            description: 'Prime dry-aged ribeye steak grilled to preference with rosemary chimichurri and garlic mash',
                            price: 34.00,
                            dietaryTags: ['High-Protein'],
                            allergens: ['Dairy'],
                            ingredients: ['Prime Ribeye', 'Chimichurri', 'Garlic Mash']
                        }
                    ]
                },
                {
                    name: 'Desserts & Beverages',
                    description: 'Sweet finishes and signature drinks',
                    dishes: [
                        {
                            name: 'Classic Tiramisu',
                            description: 'Espresso-soaked ladyfingers layered with whipped mascarpone cream and dark cocoa',
                            price: 9.50,
                            dietaryTags: ['Vegetarian'],
                            allergens: ['Dairy', 'Eggs', 'Gluten'],
                            ingredients: ['Mascarpone', 'Espresso', 'Ladyfingers', 'Cocoa']
                        }
                    ]
                }
            ]
        };
    }

    static async parseCSV(filePath) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const delimiter = detectCsvDelimiter(fileContent);
        const records = parseCsv(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
            delimiter
        });

        const items = [];
        for (const row of records) {
            const name = findSpreadsheetField(row, SPREADSHEET_ALIASES.name);
            if (!name || String(name).trim() === '') continue;

            const category = findSpreadsheetField(row, SPREADSHEET_ALIASES.category) || 'General';
            const priceRaw = findSpreadsheetField(row, SPREADSHEET_ALIASES.price);
            const description = findSpreadsheetField(row, SPREADSHEET_ALIASES.description) || '';
            const tagsRaw = findSpreadsheetField(row, SPREADSHEET_ALIASES.tags) || '';
            const allergensRaw = findSpreadsheetField(row, SPREADSHEET_ALIASES.allergens) || '';
            const ingredientsRaw = findSpreadsheetField(row, SPREADSHEET_ALIASES.ingredients) || '';

            items.push({
                name: String(name).trim(),
                category: String(category || 'General').trim(),
                price: parseSpreadsheetPrice(priceRaw),
                description: String(description).trim(),
                tags: Array.isArray(tagsRaw)
                    ? tagsRaw
                    : String(tagsRaw).split(',').map((t) => t.trim()).filter(Boolean),
                allergens: Array.isArray(allergensRaw)
                    ? allergensRaw
                    : String(allergensRaw).split(',').map((a) => a.trim()).filter(Boolean),
                ingredients: Array.isArray(ingredientsRaw)
                    ? ingredientsRaw
                    : String(ingredientsRaw).split(',').map((i) => i.trim()).filter(Boolean)
            });
        }

        return items;
    }

    static async parseExcel(filePath) {
        const workbook = xlsx.readFile(filePath);
        const items = [];

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const records = xlsx.utils.sheet_to_json(sheet, { defval: '' });

            const isGenericSheet = /^(sheet\s*\d+|blad\s*\d+|page\s*\d+|tabel\s*\d+)$/i.test(sheetName.trim());
            const defaultCategory = isGenericSheet ? 'General' : sheetName.trim();

            for (const row of records) {
                const name = findSpreadsheetField(row, SPREADSHEET_ALIASES.name);
                if (!name || String(name).trim() === '') continue;

                const category = findSpreadsheetField(row, SPREADSHEET_ALIASES.category) || defaultCategory;
                const priceRaw = findSpreadsheetField(row, SPREADSHEET_ALIASES.price);
                const description = findSpreadsheetField(row, SPREADSHEET_ALIASES.description) || '';
                const tagsRaw = findSpreadsheetField(row, SPREADSHEET_ALIASES.tags) || '';
                const allergensRaw = findSpreadsheetField(row, SPREADSHEET_ALIASES.allergens) || '';
                const ingredientsRaw = findSpreadsheetField(row, SPREADSHEET_ALIASES.ingredients) || '';

                items.push({
                    name: String(name).trim(),
                    category: String(category || defaultCategory).trim(),
                    price: parseSpreadsheetPrice(priceRaw),
                    description: String(description).trim(),
                    tags: Array.isArray(tagsRaw)
                        ? tagsRaw
                        : String(tagsRaw).split(',').map((t) => t.trim()).filter(Boolean),
                    allergens: Array.isArray(allergensRaw)
                        ? allergensRaw
                        : String(allergensRaw).split(',').map((a) => a.trim()).filter(Boolean),
                    ingredients: Array.isArray(ingredientsRaw)
                        ? ingredientsRaw
                        : String(ingredientsRaw).split(',').map((i) => i.trim()).filter(Boolean)
                });
            }
        }

        return items;
    }

    // Legacy method preserved for compatibility
    static async importCatalogFile(tenantId, catalogId, filePath, originalFilename) {
        const ext = path.extname(originalFilename).toLowerCase();
        let rawItems = [];

        if (ext === '.csv') {
            rawItems = await this.parseCSV(filePath);
        } else if (ext === '.xlsx' || ext === '.xls') {
            rawItems = await this.parseExcel(filePath);
        } else if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const text = await this.parsePdfBuffer(dataBuffer);
            rawItems = this.parseRawTextLines(text);
        } else if (ext === '.docx' || ext === '.doc') {
            const result = await mammoth.extractRawText({ path: filePath });
            rawItems = this.parseRawTextLines(result.value);
        } else {
            throw new Error(`Unsupported file extension: ${ext}`);
        }

        if (!rawItems || rawItems.length === 0) {
            throw new Error('No valid item data could be extracted from the uploaded file.');
        }

        const catalog = await Catalog.findOne({ _id: catalogId, tenantId });
        if (!catalog) throw new Error('Target catalog not found');

        const createdCategories = new Map();
        const importedItems = [];

        for (const itemData of rawItems) {
            if (!itemData.name || itemData.name.trim() === '') continue;

            const catName = (itemData.category || 'General').trim();
            let categoryId;

            if (createdCategories.has(catName)) {
                categoryId = createdCategories.get(catName);
            } else {
                let category = await Category.findOne({ tenantId, catalogId, name: catName });
                if (!category) {
                    category = await Category.create({ tenantId, catalogId, name: catName });
                }
                categoryId = category._id;
                createdCategories.set(catName, categoryId);
            }

            const item = await CatalogItem.create({
                tenantId,
                catalogId,
                categoryId,
                name: itemData.name.trim(),
                description: itemData.description || '',
                price: typeof itemData.price === 'number' ? itemData.price : parseFloat(itemData.price) || 0,
                currency: 'USD',
                tags: Array.isArray(itemData.tags) ? itemData.tags : [],
                ingredients: Array.isArray(itemData.ingredients) ? itemData.ingredients : []
            });

            importedItems.push(item);
        }

        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {}

        return {
            totalParsed: rawItems.length,
            importedCount: importedItems.length,
            categoriesCreated: createdCategories.size
        };
    }

    static parseRawTextLines(text) {
        const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
        const items = [];

        for (const line of lines) {
            const priceMatch = line.match(/\$?(\d+(?:\.\d{1,2})?)/);
            if (priceMatch) {
                const price = parseFloat(priceMatch[1]);
                const textWithoutPrice = line.replace(priceMatch[0], '').replace(/[-–—:]/g, ' ').trim();
                const parts = textWithoutPrice.split(/\s\s+/);

                const name = parts[0] || textWithoutPrice;
                const description = parts.slice(1).join(' ');

                if (name.length > 2 && price > 0) {
                    items.push({
                        name,
                        description,
                        price,
                        category: 'Imported Items'
                    });
                }
            }
        }

        return items;
    }
}

module.exports = ImportService;
