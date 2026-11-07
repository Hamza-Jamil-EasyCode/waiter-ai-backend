const AuthService = require('../services/auth/auth.service');

class AuthController {
    static async register(req, res, next) {
        try {
            const result = await AuthService.registerTenantAdmin(req.body);
            res.status(201).json({ success: true, message: 'Registration successful', data: result });
        } catch (err) {
            next(err);
        }
    }

    static async login(req, res, next) {
        try {
            const result = await AuthService.login(req.body);
            res.status(200).json({ success: true, message: 'Login successful', data: result });
        } catch (err) {
            next(err);
        }
    }

    static async me(req, res, next) {
        try {
            res.status(200).json({ success: true, data: req.user });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = AuthController;
