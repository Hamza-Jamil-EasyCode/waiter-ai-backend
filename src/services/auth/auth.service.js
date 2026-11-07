const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const config = require('../../config/config');
const { ErrorHandler } = require('../../utils/error-handler');
const { USER_ROLE } = require('../../helpers/constant-enums');

class AuthService {
    static async registerTenantAdmin({ firstName, lastName, email, password, tenantName, slug }) {
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            throw new ErrorHandler(400, 'User with this email already exists.');
        }

        const formattedSlug = (slug || tenantName).toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
        const existingTenant = await Tenant.findOne({ slug: formattedSlug });
        if (existingTenant) {
            throw new ErrorHandler(400, 'Tenant slug already taken. Please choose a different slug or restaurant name.');
        }

        const tenant = await Tenant.create({
            name: tenantName,
            slug: formattedSlug
        });

        const user = await User.create({
            firstName,
            lastName,
            email,
            password,
            role: USER_ROLE.TENANT_ADMIN,
            tenantId: tenant._id
        });

        const token = this.generateToken(user);

        return {
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                tenantId: user.tenantId
            },
            tenant,
            token
        };
    }

    static async login({ email, password }) {
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
        if (!user) {
            throw new ErrorHandler(401, 'Invalid email or password.');
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            throw new ErrorHandler(401, 'Invalid email or password.');
        }

        if (user.status !== 'ACTIVE') {
            throw new ErrorHandler(403, 'Account is inactive. Please contact support.');
        }

        let tenant = null;
        if (user.tenantId) {
            tenant = await Tenant.findById(user.tenantId);
        }

        const token = this.generateToken(user);

        return {
            user: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                tenantId: user.tenantId
            },
            tenant,
            token
        };
    }

    static generateToken(user) {
        const payload = {
            id: user._id.toString(),
            email: user.email,
            role: user.role,
            tenantId: user.tenantId ? user.tenantId.toString() : null
        };
        const secret = config.server.jwtSecretKey || config.server.accessTokenSecret || 'your_access_token_secret';
        return jwt.sign(payload, secret, { expiresIn: '7d' });
    }
}

module.exports = AuthService;
