const AssistantService = require('../services/ai/assistant.service');

class AssistantController {
    static async askQuestion(req, res, next) {
        try {
            const { question, sessionId } = req.body;
            if (!question || question.trim() === '') {
                return res.status(400).json({ success: false, message: 'Question parameter is required.' });
            }

            const tenant = req.tenant;
            const result = await AssistantService.askQuestion({
                tenant,
                question: question.trim(),
                sessionId: sessionId || 'anonymous'
            });

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = AssistantController;
