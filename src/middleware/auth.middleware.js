const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
        }

        const secret = config.server.jwtSecretKey || config.server.accessTokenSecret || 'your_access_token_secret';
        const decoded = jwt.verify(token, secret);

        const user = await User.findById(decoded.id).lean();
        if (!user || user.status !== 'ACTIVE') {
            return res.status(401).json({ success: false, message: 'Invalid token or user account inactive.' });
        }

        req.user = {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
            tenantId: user.tenantId ? user.tenantId.toString() : null
        };

        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Unauthorized access', error: err.message });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `User role '${req.user ? req.user.role : 'none'}' is not authorized to access this route.`
            });
        }
        next();
    };
};

module.exports = {
    authenticate,
    authorize
};
