const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('express-compression');
const cookieParser = require('cookie-parser');
const requestIp = require('request-ip');
const fs = require('fs');
const path = require('path');

const config = require('./src/config/config');
const { expressLogger, expressErrorLogger, logger } = require('./src/utils/winston-logger');
const { apiLimiter } = require('./src/middleware/rateLimiter.middleware');

// Platform Routes
const authRoutes = require('./src/routes/auth.routes');
const tenantRoutes = require('./src/routes/tenant.routes');
const catalogRoutes = require('./src/routes/catalog.routes');
const categoryRoutes = require('./src/routes/category.routes');
const itemRoutes = require('./src/routes/item.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const publicRoutes = require('./src/routes/public.routes');
const assistantRoutes = require('./src/routes/assistant.routes');
const analyticsRoutes = require('./src/routes/analytics.routes');
const subscriptionRoutes = require('./src/routes/subscription.routes');
const adminRoutes = require('./src/routes/admin.routes');

const app = express();

// Uploads directory
const uploadsFolder = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsFolder)) {
    fs.mkdirSync(uploadsFolder, { recursive: true });
}

app.use(cookieParser());
app.use(requestIp.mw());
app.use(expressLogger);

// CORS configuration
const corsOptions = {
    origin: process.env.UI_LINK || process.env.FRONTEND_DOMAIN || '*',
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,x-tenant-id,x-session-id',
    credentials: true
};
app.use(cors(corsOptions));

// Security & Sanitization
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));
app.use(helmet.referrerPolicy({ policy: 'no-referrer' }));
app.use(xss());
app.use(mongoSanitize());
app.use(compression());

// Static Uploads
app.use('/uploads', express.static(uploadsFolder));

// Stripe Webhook needs raw body before express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Body Parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));

// Global Rate Limiter
const apiPrefix = '/' + (config.server.route || 'api');
app.use(apiPrefix, apiLimiter);

// Health Check
app.get(`${apiPrefix}/health`, (req, res) => {
    res.status(200).json({
        success: true,
        status: 'healthy',
        service: 'AI Catalog SaaS Platform API',
        timestamp: new Date().toISOString(),
        uptime: process.process ? process.process.uptime() : process.uptime()
    });
});

// Public Diner Routes (no authentication required)
app.use(`${apiPrefix}/public`, publicRoutes);
app.use(`${apiPrefix}/public`, assistantRoutes);

// Protected Platform API Routes
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/tenants`, tenantRoutes);
app.use(`${apiPrefix}/catalogs`, catalogRoutes);
app.use(`${apiPrefix}`, categoryRoutes);
app.use(`${apiPrefix}`, itemRoutes);
app.use(`${apiPrefix}/upload`, uploadRoutes);
app.use(`${apiPrefix}/analytics`, analyticsRoutes);
app.use(`${apiPrefix}/subscriptions`, subscriptionRoutes);
app.use(`${apiPrefix}/stripe`, subscriptionRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);

// Catch 404
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Unhandled Promise Rejections & Uncaught Exceptions
process.on('unhandledRejection', (error) => {
    logger.log({
        level: 'error',
        message: `Unhandled Rejection: ${error.message}`
    });
});

process.on('uncaughtException', (error) => {
    logger.log({
        level: 'error',
        message: `Unhandled Exception: ${error.message}`
    });
});

app.use(expressErrorLogger);

// Global Error Handler
app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }
    const statusCode = error.statusCode || error.status || 500;
    const message = error.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message,
        stack: process.env.NODE_ENV === 'production' ? null : error.stack
    });
});

module.exports = app;
