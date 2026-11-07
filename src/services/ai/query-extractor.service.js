const OpenAI = require('openai');

let openAIClient = null;
function getOpenAIClient() {
    if (openAIClient) return openAIClient;
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
        openAIClient = new OpenAI({ apiKey });
    }
    return openAIClient;
}

// Approximate conversion rates relative to USD for diner currency normalisation
const APPROX_EXCHANGE_TO_USD = {
    usd: 1.0,
    eur: 1.08,
    gbp: 1.28,
    pkr: 0.0036, // 1 USD ~ 278 PKR
    inr: 0.012,  // 1 USD ~ 83 INR
    aed: 0.27,
    sar: 0.27,
    cny: 0.14
};

const CURRENCY_ALIASES = {
    '$': 'USD',
    'USD': 'USD',
    'DOLLAR': 'USD',
    'DOLLARS': 'USD',
    'BUCKS': 'USD',
    'BUCK': 'USD',
    'RS': 'PKR',
    'RS.': 'PKR',
    'PKR': 'PKR',
    'RUPEE': 'PKR',
    'RUPEES': 'PKR',
    'INR': 'INR',
    '€': 'EUR',
    'EUR': 'EUR',
    'EUROS': 'EUR',
    'EURO': 'EUR',
    '£': 'GBP',
    'GBP': 'GBP',
    'POUND': 'GBP',
    'POUNDS': 'GBP',
    'AED': 'AED',
    'DIRHAM': 'AED',
    'DIRHAMS': 'AED',
    'SAR': 'SAR',
    'RIYAL': 'SAR',
    'RIYALS': 'SAR',
    'CNY': 'CNY',
    'RMB': 'CNY',
    'YUAN': 'CNY'
};

function toCanonicalCurrency(curr) {
    if (!curr || typeof curr !== 'string') return null;
    const cleaned = curr.trim().toUpperCase().replace(/[^A-Z$€£]/g, '');
    return CURRENCY_ALIASES[cleaned] || CURRENCY_ALIASES[curr.trim().toUpperCase()] || cleaned;
}

class QueryExtractorService {
    /**
     * Extracts structured intent, multilingual constraints, ingredient inclusions/exclusions,
     * and currency considerations from a diner's question.
     */
    static async extract({ question, catalogCurrency = 'USD' }) {
        if (!question || typeof question !== 'string' || question.trim() === '') {
            return {
                intent: 'empty',
                isGibberish: true,
                cleanSearchQuery: '',
                mustContainIngredients: [],
                mustNotContainIngredients: [],
                dietaryTags: [],
                maxPrice: null,
                minPrice: null,
                originalMaxPrice: null,
                originalMinPrice: null,
                priceCurrency: null,
                currencyWasConverted: false,
                sortBy: null,
                requestedCount: 5,
                detectedLanguage: 'en',
                targetLanguageOverride: null
            };
        }

        const trimmed = question.trim();

        // Fast-path bypass for trivial greetings & generic 1-word inquiries to minimize latency
        if (/^(hi|hello|hey|menu|food|drinks|desserts|burgers|help)\b/i.test(trimmed) && trimmed.split(/\s+/).length <= 2) {
            return {
                intent: /menu/i.test(trimmed) ? 'general_menu' : 'conversational',
                isGibberish: false,
                cleanSearchQuery: trimmed,
                mustContainIngredients: [],
                mustNotContainIngredients: [],
                dietaryTags: [],
                maxPrice: null,
                minPrice: null,
                originalMaxPrice: null,
                originalMinPrice: null,
                priceCurrency: null,
                currencyWasConverted: false,
                sortBy: null,
                requestedCount: 6,
                detectedLanguage: 'en',
                targetLanguageOverride: null
            };
        }

        const client = getOpenAIClient();
        if (!client) {
            // Fallback to basic heuristic extraction if OpenAI API key is missing
            return this.heuristicFallback(trimmed, catalogCurrency);
        }

        const canonicalCatalogCurrency = toCanonicalCurrency(catalogCurrency) || 'USD';

        const systemPrompt = `You are a query parsing engine for a multilingual restaurant menu assistant.
Analyze the diner's query and extract structured information into JSON:
{
  "intent": "dish_inquiry" | "recommendation" | "policy" | "conversational" | "gibberish",
  "isGibberish": boolean, // true if keyboard smash, non-words, or completely meaningless text (e.g. "asdfghjkl1234")
  "detectedLanguage": "en" | "es" | "zh" | "it" | "fr" | "nl" | "ar" | "de" | "other",
  "targetLanguageOverride": string | null, // e.g. "fr" if asked "answer in French" or "répondez en français"
  "cleanSearchQuery": string, // Normalized English keywords for positive search. CRITICAL: NEVER INCLUDE NEGATED/EXCLUDED INGREDIENTS HERE! (e.g. for "dishes with garlic but no onions", cleanSearchQuery MUST be "garlic", NOT "without onions")
  "mustContainIngredients": string[], // In English, ingredients explicitly requested (e.g. ["garlic"])
  "mustNotContainIngredients": string[], // In English, ingredients/allergens explicitly excluded (e.g. ["onion", "dairy", "cheese"])
  "dietaryTags": string[], // e.g. ["vegetarian", "vegan", "gluten-free", "halal", "kosher"]
  "maxPrice": number | null,
  "minPrice": number | null,
  "priceCurrency": string | null, // e.g. "USD", "PKR", "EUR", "GBP"
  "sortBy": "price_asc" | "price_desc" | null, // price_asc for cheapest/best budget, price_desc for priciest
  "requestedCount": number | null // e.g. 3 if user asks "best three options", 1 if "which dish"
}

Important Rules:
1. Translate foreign ingredients into canonical English for the catalog (e.g. "sin cebolla" -> mustNotContainIngredients: ["onion"]; "senza aglio" -> mustNotContainIngredients: ["garlic"]; "sans fromage" -> mustNotContainIngredients: ["cheese"]).
2. Always detect negations: "no onions", "without garlic", "except cheese", "dairy-free", "allergic to nuts". DO NOT include these in cleanSearchQuery.
3. Extract currency properly: "$15" -> maxPrice: 15, priceCurrency: "USD"; "Rs. 1,000" -> maxPrice: 1000, priceCurrency: "PKR".
4. If input is random letters/symbols (e.g. "asdfghjkl", "123456xyz"), set isGibberish: true and intent: "gibberish".
Output raw JSON only.`;

        try {
            const response = await client.chat.completions.create({
                model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: trimmed }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.1,
                max_tokens: 220
            });

            const parsed = JSON.parse(response.choices[0].message.content || '{}');

            // Normalize currency constraints against catalog currency if mismatched
            const normalizedPrice = this.normalizeCurrency({
                maxPrice: parsed.maxPrice,
                minPrice: parsed.minPrice,
                queryCurrency: parsed.priceCurrency,
                catalogCurrency: canonicalCatalogCurrency
            });

            return {
                intent: parsed.intent || 'dish_inquiry',
                isGibberish: !!parsed.isGibberish,
                detectedLanguage: parsed.detectedLanguage || 'en',
                targetLanguageOverride: parsed.targetLanguageOverride || null,
                cleanSearchQuery: parsed.cleanSearchQuery || trimmed,
                mustContainIngredients: Array.isArray(parsed.mustContainIngredients) ? parsed.mustContainIngredients : [],
                mustNotContainIngredients: Array.isArray(parsed.mustNotContainIngredients) ? parsed.mustNotContainIngredients : [],
                dietaryTags: Array.isArray(parsed.dietaryTags) ? parsed.dietaryTags : [],
                maxPrice: normalizedPrice.maxPrice,
                minPrice: normalizedPrice.minPrice,
                originalMaxPrice: parsed.maxPrice ?? null,
                originalMinPrice: parsed.minPrice ?? null,
                priceCurrency: parsed.priceCurrency || canonicalCatalogCurrency,
                currencyWasConverted: normalizedPrice.wasConverted,
                sortBy: parsed.sortBy || null,
                requestedCount: parsed.requestedCount || 5
            };
        } catch (err) {
            console.error('[QueryExtractorService] extraction error:', err.message);
            return this.heuristicFallback(trimmed, catalogCurrency);
        }
    }

    /**
     * Converts or safely bounds price if diner query currency differs from catalog currency
     * (e.g. customer asks for "$15" on a restaurant whose catalog is in PKR "Rs.")
     */
    static normalizeCurrency({ maxPrice, minPrice, queryCurrency, catalogCurrency }) {
        if (!maxPrice && !minPrice) {
            return { maxPrice: null, minPrice: null, wasConverted: false };
        }

        const qCanonical = toCanonicalCurrency(queryCurrency);
        const cCanonical = toCanonicalCurrency(catalogCurrency) || 'USD';

        if (!qCanonical || qCanonical === cCanonical) {
            return { maxPrice, minPrice, wasConverted: false };
        }

        const qRate = APPROX_EXCHANGE_TO_USD[qCanonical.toLowerCase()];
        const cRate = APPROX_EXCHANGE_TO_USD[cCanonical.toLowerCase()];

        if (qRate && cRate && qRate !== cRate) {
            // Conversion factor: 1 unit of queryCurrency = (qRate / cRate) units of catalogCurrency
            // E.g. USD (1.0) to PKR (0.0036): factor = 1.0 / 0.0036 = 277.78
            // 15 USD = ~ 4167 PKR
            const factor = qRate / cRate;
            return {
                maxPrice: maxPrice ? Math.round(maxPrice * factor) : null,
                minPrice: minPrice ? Math.round(minPrice * factor) : null,
                wasConverted: true
            };
        }

        return { maxPrice, minPrice, wasConverted: false };
    }

    static heuristicFallback(trimmed, catalogCurrency = 'USD') {
        return {
            intent: 'dish_inquiry',
            isGibberish: false,
            detectedLanguage: 'en',
            targetLanguageOverride: null,
            cleanSearchQuery: trimmed,
            mustContainIngredients: [],
            mustNotContainIngredients: [],
            dietaryTags: [],
            maxPrice: null,
            minPrice: null,
            originalMaxPrice: null,
            originalMinPrice: null,
            priceCurrency: toCanonicalCurrency(catalogCurrency) || 'USD',
            currencyWasConverted: false,
            sortBy: null,
            requestedCount: 5
        };
    }
}

module.exports = QueryExtractorService;
module.exports.toCanonicalCurrency = toCanonicalCurrency;

