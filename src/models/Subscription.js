const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            unique: true,
            index: true
        },
        stripeCustomerId: {
            type: String,
            default: ''
        },
        stripeSubscriptionId: {
            type: String,
            default: ''
        },
        plan: {
            type: String,
            default: 'basic'
        },
        status: {
            type: String,
            default: 'inactive'
        },
        currentPeriodStart: {
            type: Date
        },
        currentPeriodEnd: {
            type: Date
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
