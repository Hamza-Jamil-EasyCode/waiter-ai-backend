const OpenAI = require('openai');

class ModerationService {
    static getClient() {
        if (this._client) return this._client;
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return null;
        this._client = new OpenAI({ apiKey });
        return this._client;
    }

    static async checkSafety(text) {
        if (!text || text.trim() === '') return { safe: true };

        const client = this.getClient();
        if (!client) return { safe: true };

        try {
            const response = await client.moderations.create({ input: text });
            const result = response.results[0];

            if (result && result.flagged) {
                return {
                    safe: false,
                    reason: 'Content flagged by moderation filter.'
                };
            }

            return { safe: true };
        } catch (err) {
            console.error('Moderation check error:', err.message);
            // Default to safe if moderation service fails so valid queries aren't blocked
            return { safe: true };
        }
    }
}

module.exports = ModerationService;
