const OpenAI = require('openai');
const Catalog = require('../../models/Catalog');
const CatalogItem = require('../../models/CatalogItem');
const Question = require('../../models/Question');
const AnalyticsEvent = require('../../models/AnalyticsEvent');
const RetrievalService = require('./retrieval.service');
const ModerationService = require('./moderation.service');
const CostService = require('./cost.service');

let openAIClient = null;
function getOpenAIClient() {
    if (openAIClient) return openAIClient;
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
        openAIClient = new OpenAI({ apiKey });
    }
    return openAIClient;
}

function isConversationalOrLanguageInquiry(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase().trim();

    // 1. Non-Latin scripts (Chinese, Arabic, Japanese, Korean, Cyrillic, Devanagari, Urdu)
    if (/[\u4e00-\u9fa5]/.test(text)) return true; // Chinese
    if (/[\u0600-\u06ff]/.test(text)) return true; // Arabic / Urdu / Farsi
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return true; // Japanese (Kana)
    if (/[\uac00-\ud7af]/.test(text)) return true; // Korean (Hangul)
    if (/[\u0400-\u04ff]/.test(text)) return true; // Cyrillic (Russian, etc.)
    if (/[\u0900-\u097f]/.test(text)) return true; // Hindi (Devanagari)

    // 2. Multilingual names of supported languages (in English & native forms)
    const languageNames = [
        'dutch', 'nederlands', 'hollands', 'vlaams',
        'english', 'engels', 'anglais', 'inglés', 'ingles',
        'french', 'français', 'francais', 'französisch',
        'german', 'deutsch', 'deutsche', 'allemand', 'alemán', 'aleman',
        'spanish', 'español', 'espanol', 'castellano', 'espagnol', 'spanisch',
        'italian', 'italiano', 'italien', 'italienisch',
        'arabic', 'arabe', 'arabisch', 'arabische',
        'chinese', 'mandarin', 'cantonese', 'chinois', 'chinesisch', 'chino',
        'japanese', 'japonais', 'japanisch', 'japonés', 'japones',
        'korean', 'coréen', 'koreanisch', 'coreano',
        'portuguese', 'português', 'portugues', 'portugais', 'portugiesisch',
        'russian', 'russe', 'russisch', 'ruso',
        'turkish', 'türkçe', 'turkce', 'turc', 'türkisch',
        'hindi', 'urdu', 'swedish', 'norwegian', 'danish', 'polish', 'greek'
    ].join('|');

    // 3. Conversational language phrases
    const commVerbs = 'speak|speaking|talk|talking|converse|conversation|conversations|chat|chatting|communicate|reply|replying|respond|switch|change|use|using|translate|translation|understand|understanding|know|learn|write|writing';
    const langPattern = new RegExp(`\\b(${commVerbs})\\b.*\\b(${languageNames})\\b`, 'i');
    const langInPattern = new RegExp(`\\b(${languageNames})\\b.*\\b(${commVerbs})\\b`, 'i');
    const inLangPattern = new RegExp(`\\b(in|op|en|auf|au)\\s+(${languageNames})\\b`, 'i');

    if (langPattern.test(lower) || langInPattern.test(lower) || inLangPattern.test(lower)) return true;

    if (/\b(what|which)\s+languages?\b/i.test(lower)) return true;
    if (/\b(can\s+we|could\s+we|do\s+you|are\s+you\s+able\s+to|can\s+you|let's|lets)\s+(speak|talk|chat|converse|communicate|write)\b/i.test(lower)) return true;

    // 4. Native greetings & conversational openers across supported languages
    const greetings = [
        // English
        '^(hi|hello|hey|good\\s+(morning|afternoon|evening)|howdy|greetings)\\b',
        // Dutch
        '\\b(hallo|hoi|goedendag|goedenavond|goedenmorgen|spreek\\s+je|kunnen\\s+we|hoe\\s+gaat\\s+het)\\b',
        // German
        '\\b(guten\\s+(tag|morgen|abend)|sprichst\\s+du|können\\s+wir|wie\\s+geht\'?s)\\b',
        // French
        '\\b(bonjour|salut|bonsoir|parlez-vous|on\\s+peut\\s+parler|comment\\s+allez-vous)\\b',
        // Spanish
        '\\b(hola|buenos\\s+días|buenas\\s+tardes|buenas\\s+noches|hablas|podemos\\s+hablar|cómo\\s+estás)\\b',
        // Italian
        '\\b(ciao|buongiorno|buonasera|parli|possiamo\\s+parlare|come\\s+stai)\\b',
        // General / international
        '\\b(namaste|assalam\\s*o?\\s*alaikum|aloha)\\b'
    ];
    if (new RegExp(greetings.join('|'), 'i').test(lower)) {
        return true;
    }

    // 5. Capability / identity inquiries
    if (/\b(who\s+are\s+you|what\s+can\s+you\s+do|how\s+can\s+you\s+help|what\s+do\s+you\s+do|help\s+me)\b/i.test(lower)) {
        return true;
    }

    return false;
}

const QueryExtractorService = require('./query-extractor.service');

class AssistantService {
    static async askQuestion({ tenant, question, sessionId = 'anonymous' }) {
        const tenantId = tenant._id.toString();

        // 1. Find published catalog for tenant
        const activeCatalog = await Catalog.findOne({ tenantId, status: 'PUBLISHED' }).lean();
        if (!activeCatalog) {
            const refusalAnswer = 'Catalog is currently not published or unavailable.';
            this.logUnansweredQuestion({
                tenantId,
                catalogId: null,
                sessionId,
                question,
                answer: refusalAnswer,
                reason: 'NO_ACTIVE_CATALOG'
            }).catch(() => {});
            return {
                answer: refusalAnswer,
                answered: false,
                retrievedItems: []
            };
        }

        const catalogId = activeCatalog._id.toString();

        // Asynchronously log incoming question
        AnalyticsEvent.create({
            tenantId,
            catalogId,
            sessionId,
            eventType: 'QUESTION_ASKED',
            metadata: { question }
        }).catch((err) => console.error('Analytics log error:', err.message));

        // Determine catalog's primary currency
        const sampleItem = await CatalogItem.findOne({ catalogId, tenantId }).select('currency').lean();
        const catalogCurrency = sampleItem?.currency || 'USD';

        // Stage 1: Parallel Pre-Flight Extraction, Safety Moderation, and Session History
        const [extracted, moderation, recentQuestions] = await Promise.all([
            QueryExtractorService.extract({ question, catalogCurrency }),
            ModerationService.checkSafety(question),
            sessionId && sessionId !== 'anonymous'
                ? Question.find({ tenantId, sessionId }).sort({ createdAt: -1 }).limit(4).lean()
                : Promise.resolve([])
        ]);

        // Stage 2: Fast-Fail / Short-Circuit Guards (Moderation & Gibberish)
        if (!moderation.safe) {
            const blockedAnswer = 'Your question could not be processed due to content safety guidelines.';
            this.logUnansweredQuestion({
                tenantId,
                catalogId,
                sessionId,
                question,
                answer: blockedAnswer,
                reason: 'MODERATION_BLOCKED'
            }).catch(() => {});
            return {
                answer: blockedAnswer,
                answered: false,
                retrievedItems: []
            };
        }

        if (extracted.isGibberish) {
            const gibberishReplies = {
                es: "Lo siento, no pude entender su mensaje. ¡Por favor pregúnteme sobre nuestros platos, ingredientes, precios o preferencias dietéticas!",
                fr: "Désolé, je n'ai pas compris votre message. N'hésitez pas à me poser des questions sur nos plats, ingrédients, prix ou régimes alimentaires !",
                zh: "抱歉，我未能理解您的输入。请随时询问我们的菜品、食材、价格或饮食偏好！",
                it: "Mi scusi, non ho compreso la sua richiesta. Mi chieda pure informazioni sui nostri piatti, ingredienti, prezzi o opzioni dietetiche!",
                nl: "Sorry, ik kon dat niet begrijpen. Vraag me gerust naar onze gerechten, ingrediënten, prijzen of dieetwensen!",
                ar: "عذرًا، لم أتمكن من فهم رسالتك. يُرجى سؤالي عن أطباقنا أو المكونات أو الأسعار أو التفضيلات الغذائية!",
                de: "Entschuldigung, das habe ich nicht verstanden. Bitte fragen Sie mich gerne nach unseren Gerichten, Zutaten, Preisen oder Ernährungswünschen!"
            };
            const gibberishAnswer = gibberishReplies[extracted.detectedLanguage] || "I'm sorry, I couldn't understand that. Please feel free to ask about our dishes, ingredients, prices, or dietary preferences!";
            this.logUnansweredQuestion({
                tenantId,
                catalogId,
                sessionId,
                question,
                answer: gibberishAnswer,
                reason: 'GIBBERISH_INPUT'
            }).catch(() => {});
            return {
                answer: gibberishAnswer,
                answered: false,
                retrievedItems: []
            };
        }

        // Stage 3: Adaptive Retrieval Pipeline with Defensive Relaxation
        const retrievalResult = await RetrievalService.retrieveRelevantItems({
            tenantId,
            catalogId,
            query: question,
            extracted,
            limit: extracted.requestedCount || parseInt(process.env.AI_MAX_RETRIEVAL_RESULTS || '5', 10)
        });

        let items = retrievalResult.items || [];
        let isConversational = false;

        // Stage 4: Follow-up resolution or Conversational/Policy fallback
        if (items.length === 0) {
            // Check if this is a follow-up referring to previous turn's dishes
            if (recentQuestions.length > 0 && recentQuestions[0].retrievedItemIds?.length > 0) {
                const prevItems = await CatalogItem.find({
                    _id: { $in: recentQuestions[0].retrievedItemIds },
                    tenantId
                }).lean();
                if (prevItems.length > 0) {
                    items = prevItems;
                    isConversational = true;
                }
            }

            if (items.length === 0 && (extracted.intent === 'conversational' || isConversationalOrLanguageInquiry(question) || recentQuestions.length > 0 || /sushi|hours|delivery|discount|rating|nutrition|halal|kosher|certified|certification|allergen|policy/i.test(question))) {
                isConversational = true;
                items = await CatalogItem.find({
                    catalogId,
                    tenantId,
                    isAvailable: true
                })
                    .sort({ sortOrder: 1, name: 1 })
                    .limit(8)
                    .lean();
            }

            if (items.length === 0) {
                const refusalAnswer = "I couldn't find any items matching your request in our catalog. Please ask our staff if you'd like custom recommendations!";
                this.logUnansweredQuestion({
                    tenantId,
                    catalogId,
                    sessionId,
                    question,
                    answer: refusalAnswer,
                    reason: 'NO_RELEVANT_CATALOG_DATA'
                }).catch(() => {});

                return {
                    answer: refusalAnswer,
                    answered: false,
                    retrievedItems: []
                };
            }
        }

        // 5. Build controlled context for LLM
        const contextLines = items.map((item, idx) => {
            const currSymbol = item.currency === 'USD' ? '$' : `${item.currency || 'Rs.'} `;
            const priceStr = item.price !== undefined ? `${currSymbol}${item.price}` : 'Price not specified';
            const catStr = item.category || item.categoryName ? ` [Category: ${item.category || item.categoryName}]` : '';
            const tagsStr = item.tags && item.tags.length > 0 ? ` [Tags: ${item.tags.join(', ')}]` : '';
            const ingStr = item.ingredients && item.ingredients.length > 0 ? ` [Ingredients: ${item.ingredients.join(', ')}]` : '';
            const availStr = item.isAvailable ? 'Available' : 'Currently Unavailable';

            const attrs = item.attributes || {};
            const extraDetails = [];

            if (attrs.longerStory) {
                extraDetails.push(`Culinary story: ${attrs.longerStory}`);
            }

            if (Array.isArray(attrs.dietaryTags) && attrs.dietaryTags.length > 0) {
                extraDetails.push(`Dietary suitability: ${attrs.dietaryTags.join(', ')}`);
            }

            if (Array.isArray(attrs.allergens) && attrs.allergens.length > 0) {
                extraDetails.push(`Contains allergens: ${attrs.allergens.join(', ')}`);
            }

            if (attrs.prepTime || attrs.PrepTime) {
                extraDetails.push(`Prep time: ${attrs.prepTime || attrs.PrepTime}`);
            }

            if (attrs.calories || attrs.Calories) {
                extraDetails.push(`Calories: ${attrs.calories || attrs.Calories}`);
            }

            if (attrs.spiciness || attrs.Spiciness) {
                extraDetails.push(`Spiciness level: ${attrs.spiciness || attrs.Spiciness}`);
            }

            if (attrs.macros && typeof attrs.macros === 'object') {
                const { protein, carbs, fat } = attrs.macros;
                extraDetails.push(`Macros: ${protein || 0}g protein, ${carbs || 0}g carbs, ${fat || 0}g fat`);
            }

            if (attrs.portion) {
                const { value, unit, serves } = attrs.portion;
                if (serves) extraDetails.push(`Serves: ${serves} person(s)`);
                if (value && unit) extraDetails.push(`Portion: ${value}${unit}`);
            }

            if (attrs.isTonightPick) {
                extraDetails.push("Chef's special recommendation / Tonight's Pick");
            }

            if (Array.isArray(attrs.sizes) && attrs.sizes.length > 0) {
                const sizeStr = attrs.sizes.map((s) => `${s.name} (${currSymbol}${s.price})`).join(', ');
                extraDetails.push(`Sizes: ${sizeStr}`);
            }

            const extraStr = extraDetails.length > 0 ? ` [Details: ${extraDetails.join(' | ')}]` : '';

            return `${idx + 1}. Item: ${item.name}${catStr} - ${priceStr} (${availStr}). Description: ${item.description || 'N/A'}.${tagsStr}${ingStr}${extraStr}`;
        });

        const catalogContext = contextLines.join('\n');

        const effectiveLang = extracted.targetLanguageOverride || extracted.detectedLanguage || 'en';
        const langInstructions = extracted.targetLanguageOverride
            ? `EXPLICIT LANGUAGE OVERRIDE: The customer explicitly requested the answer in "${extracted.targetLanguageOverride}". You MUST strictly write your ENTIRE response in "${extracted.targetLanguageOverride}".`
            : `Respond naturally in the customer's language (${effectiveLang}).`;

        const constraintNotes = [];
        if (extracted.mustContainIngredients?.length) {
            constraintNotes.push(`- Customer requested dishes containing: ${extracted.mustContainIngredients.join(', ')}.`);
        }
        if (extracted.mustNotContainIngredients?.length) {
            constraintNotes.push(`- Customer explicitly excluded dishes containing: ${extracted.mustNotContainIngredients.join(', ')}. Do NOT recommend any dish with these ingredients.`);
        }
        if (extracted.currencyWasConverted) {
            constraintNotes.push(`- Customer queried in ${extracted.priceCurrency} (${extracted.originalMaxPrice}), which equals approx. ${extracted.maxPrice} ${catalogCurrency} in our catalog. Present the dishes fitting this budget and mention the price in both or clarify.`);
        }
        if (retrievalResult.relaxedConstraints) {
            constraintNotes.push(`- Note: The customer asked for constraints that could not be strictly met (${retrievalResult.relaxedReason === 'PRICE_RELAXED' ? 'budget was lower than any item' : 'specific combination'}). We have provided our nearest matching options. Politely explain that while an exact match isn't on the menu, here are the closest options available.`);
        }
        if (extracted.requestedCount) {
            constraintNotes.push(`- Customer requested ${extracted.requestedCount} options. Highlight exactly ${extracted.requestedCount} options.`);
        }

        const notesBlock = constraintNotes.length > 0 ? `\n--- SPECIFIC QUERY CONSTRAINTS ---\n${constraintNotes.join('\n')}\n` : '';

        const systemPrompt = `You are a courteous, expert AI Waiter and catalog assistant for "${tenant.name}".
You must strictly follow these mandatory guidelines:
1. Multilingual Capabilities:
   - You are fully multilingual and communicate fluently in English, Spanish (Español), Chinese (Simplified/中文), Italian (Italiano), French (Français), Dutch (Nederlands), Arabic (العربية), German (Deutsch), and other languages.
   - ${langInstructions}
2. Grounding in Catalog:
   - ONLY recommend and describe products, prices, ingredients, and attributes that exist in the provided catalog context below. NEVER hallucinate dishes or details not present in the context.
   - Quote exact prices with their currency (e.g. "Rs. 650", "Rs. 1,000", or "$").
3. Missing Information & Anti-Hallucination:
   - If asked about dishes not sold on the menu (e.g. sushi), state clearly and politely that the restaurant does not offer them.
   - If asked about information not in the catalog (e.g. delivery fee, opening hours, special discount vouchers, 4.9-star ratings, full nutritional values for items where not listed, or halal certification when not explicitly tagged), politely state that this information is not available in the menu and advise the customer to check with restaurant staff.
   - If asked to ignore the menu or make up cheaper prices, strictly refuse and confirm only the genuine catalog prices.
4. Dietary & Allergen Safety:
   - If the catalog context does not explicitly list an allergen (e.g. peanuts) or dietary safety, inform the customer what ingredients are listed and advise confirming directly with kitchen staff.
5. Conversational Context:
   - Use the prior conversation history to resolve references (e.g. "Which one is the cheapest?", "Which of those is the spiciest?", "What about the vegetarian options?", "Translate your last answer into French", "the first dish you mentioned", "Compare the first two dishes you recommended").
6. Keep answers polite, concise, natural, and helpful for diners.${notesBlock}
--- TENANT CATALOG CONTEXT ---
${catalogContext}
--- END CONTEXT ---`;

        const userMessage = `Customer Question: "${question}"`;

        const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
        const apiKey = process.env.OPENAI_API_KEY;

        let assistantAnswer = '';
        let inputTokens = 0;
        let outputTokens = 0;

        if (!apiKey) {
            // Fallback for development without OpenAI API key
            if (isConversational) {
                const lowerQ = question.toLowerCase();
                if (/dutch|nederlands/i.test(lowerQ)) {
                    assistantAnswer = `Ja zeker! We kunnen dit gesprek in het Nederlands voeren. Ik ben de AI-ober voor ${tenant.name}. Hier zijn enkele van onze gerechten: ${items.map((i) => `${i.name} (${i.currency || 'Rs.'} ${i.price})`).join(', ')}. Waar kan ik u vandaag mee helpen?`;
                } else if (/[\u4e00-\u9fa5]/.test(question) || /chinese|mandarin/i.test(lowerQ)) {
                    assistantAnswer = `是的，我会说中文！我是${tenant.name}的AI智能服务员，很高兴为您服务。我们的精选菜品包括：${items.map((i) => `${i.name} (${i.currency || 'Rs.'} ${i.price})`).join('、')}。请问有什么想了解的吗？`;
                } else if (/spanish|español/i.test(lowerQ)) {
                    assistantAnswer = `¡Sí, por supuesto! Podemos continuar en español. Soy el camarero virtual de ${tenant.name}. Aquí tiene algunos de nuestros platos: ${items.map((i) => `${i.name} (${i.currency || 'Rs.'} ${i.price})`).join(', ')}. ¿En qué le puedo ayudar?`;
                } else if (/french|français/i.test(lowerQ)) {
                    assistantAnswer = `Oui, bien sûr ! Nous pouvons continuer en français. Je suis le serveur IA de ${tenant.name}. Voici quelques-uns de nos plats : ${items.map((i) => `${i.name} (${i.currency || 'Rs.'} ${i.price})`).join(', ')}. Comment puis-je vous aider ?`;
                } else if (/german|deutsch/i.test(lowerQ)) {
                    assistantAnswer = `Ja, natürlich! Wir können uns gerne auf Deutsch unterhalten. Ich bin der KI-Kellner für ${tenant.name}. Hier sind einige unserer Gerichte: ${items.map((i) => `${i.name} (${i.currency || 'Rs.'} ${i.price})`).join(', ')}. Wie kann ich Ihnen helfen?`;
                } else {
                    assistantAnswer = `Hello! Yes, I can speak Dutch, English, Spanish, French, German, and many other languages. I am your AI Waiter for ${tenant.name}. Here are some of our popular dishes: ${items.map((i) => `${i.name} (${i.currency || 'Rs.'} ${i.price})`).join(', ')}. How can I assist you today?`;
                }
            } else {
                assistantAnswer = `Based on our catalog context, we found matching items: ${items.map((i) => `${i.name} (${i.currency || 'Rs.'} ${i.price})`).join(', ')}.`;
            }
        } else {
            const client = getOpenAIClient();
            try {
                // Build conversation messages with recent turns
                const messages = [{ role: 'system', content: systemPrompt }];
                for (const prev of recentQuestions.slice().reverse()) {
                    messages.push({ role: 'user', content: `Customer Question: "${prev.question}"` });
                    if (prev.answer) {
                        messages.push({ role: 'assistant', content: prev.answer.length > 250 ? prev.answer.slice(0, 250) + '...' : prev.answer });
                    }
                }
                messages.push({ role: 'user', content: userMessage });

                const response = await client.chat.completions.create({
                    model: model,
                    messages,
                    temperature: 0.3,
                    max_tokens: 250
                });

                assistantAnswer = response.choices[0].message.content.trim();

                if (response.usage) {
                    inputTokens = response.usage.prompt_tokens;
                    outputTokens = response.usage.completion_tokens;

                    CostService.logUsage({
                        tenantId,
                        model,
                        operation: 'CHAT',
                        inputTokens,
                        outputTokens
                    }).catch((err) => console.error('Cost logging error:', err.message));
                }
            } catch (err) {
                console.error('OpenAI Chat Completion failed:', err.message);
                assistantAnswer = `Here are the matching items from our catalog: ${items.map((i) => `${i.name} (${i.currency || 'Rs.'} ${i.price})`).join(', ')}.`;
            }
        }

        // 6. Check if answer indicates missing info or answered
        const isAnswered = isConversational || (!assistantAnswer.toLowerCase().includes('not listed') && !assistantAnswer.toLowerCase().includes('not present'));
        const retrievedItemIds = items.map((i) => i._id);

        // 7. Store Question record asynchronously in background
        Question.create({
            tenantId,
            catalogId,
            sessionId,
            question,
            answered: isAnswered,
            answer: assistantAnswer,
            retrievedItemIds,
            confidence: items[0]?.score || 0.8,
            reason: isAnswered ? 'ANSWERED' : 'NO_RELEVANT_CATALOG_DATA'
        }).catch((err) => console.error('Question record log error:', err.message));

        // 8. Store Analytics Event asynchronously in background
        AnalyticsEvent.create({
            tenantId,
            catalogId,
            sessionId,
            eventType: isAnswered ? 'QUESTION_ANSWERED' : 'QUESTION_UNANSWERED',
            metadata: { question, answer: assistantAnswer }
        }).catch((err) => console.error('Analytics event error:', err.message));

        return {
            answer: assistantAnswer,
            answered: isAnswered,
            retrievedItems: items.map((i) => ({
                id: i._id,
                name: i.name,
                price: i.price,
                description: i.description,
                image: i.image,
                isAvailable: i.isAvailable
            }))
        };
    }

    static async logUnansweredQuestion({ tenantId, catalogId, sessionId, question, answer, reason }) {
        try {
            await Question.create({
                tenantId,
                catalogId,
                sessionId,
                question,
                answered: false,
                answer,
                retrievedItemIds: [],
                confidence: 0,
                reason
            });

            await AnalyticsEvent.create({
                tenantId,
                catalogId,
                sessionId,
                eventType: 'QUESTION_UNANSWERED',
                metadata: { question, reason }
            });
        } catch (err) {
            console.error('Failed to log unanswered question:', err.message);
        }
    }
}

module.exports = AssistantService;
