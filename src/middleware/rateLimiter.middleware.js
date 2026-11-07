const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // 100 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again after 15 minutes.'
    }
});

// Stricter rate limiter for anonymous AI assistant public endpoint
const publicAskLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 questions per IP per 15 minutes to prevent prompt abuse & cost attacks
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Rate limit based on IP + sessionId if present
        const sessionId = req.body && req.body.sessionId ? req.body.sessionId : '';
        return req.ip + '_' + sessionId;
    },
    message: {
        success: false,
        message: 'Rate limit exceeded for AI question requests. Please wait a few minutes before asking another question.'
    }
});

module.exports = {
    apiLimiter,
    publicAskLimiter
};
