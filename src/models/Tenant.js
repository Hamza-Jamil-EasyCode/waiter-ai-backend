const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        logo: {
            type: String,
            default: ''
        },
        primaryColor: {
            type: String,
            default: '#1a56db'
        },
        secondaryColor: {
            type: String,
            default: '#f3f4f6'
        },
        defaultLanguage: {
            type: String,
            default: 'en'
        },
        status: {
            type: String,
            enum: ['ACTIVE', 'SUSPENDED'],
            default: 'ACTIVE'
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Tenant', tenantSchema);
