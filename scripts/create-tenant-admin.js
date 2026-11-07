const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongooseConfig = require('../src/config/mongoose');
const User = require('../src/models/User');
const Tenant = require('../src/models/Tenant');

async function createTenantLogin() {
    try {
        await mongooseConfig.connect();

        const tenant = await Tenant.findOne({ slug: 'ai-multilingual-benchmark' });
        if (!tenant) {
            console.error('❌ Tenant ai-multilingual-benchmark not found!');
            process.exit(1);
        }

        const email = 'admin@spicensizzle.com';
        const rawPassword = 'SpiceSizzle2026!';

        let user = await User.findOne({ email });

        if (user) {
            console.log(`User ${email} already exists. Updating password & tenant association...`);
            user.firstName = 'Spice & Sizzle';
            user.lastName = 'Admin';
            user.password = rawPassword; // pre('save') will hash this
            user.tenantId = tenant._id;
            user.role = 'TENANT_ADMIN';
            user.status = 'ACTIVE';
            await user.save();
            console.log(`✅ User ${email} successfully updated.`);
        } else {
            console.log(`Creating new TENANT_ADMIN user for ${tenant.name}...`);
            user = new User({
                firstName: 'Spice & Sizzle',
                lastName: 'Admin',
                email,
                password: rawPassword, // pre('save') will hash this
                role: 'TENANT_ADMIN',
                tenantId: tenant._id,
                status: 'ACTIVE'
            });
            await user.save();
            console.log(`✅ User ${email} successfully created.`);
        }

        console.log('\n--- Credentials Details ---');
        console.log(`Tenant Name: ${tenant.name}`);
        console.log(`Tenant Slug: ${tenant.slug}`);
        console.log(`Tenant ID:   ${tenant._id}`);
        console.log(`Email:       ${email}`);
        console.log(`Password:    ${rawPassword}`);
        console.log(`Role:        ${user.role}`);
        console.log(`Status:      ${user.status}`);

        // Verify login test using comparePassword
        const testUser = await User.findOne({ email }).select('+password');
        const isMatch = await testUser.comparePassword(rawPassword);
        console.log(`\n🔐 Password verification check: ${isMatch ? 'PASSED' : 'FAILED'}`);

    } catch (err) {
        console.error('Error creating tenant login:', err);
    } finally {
        await mongooseConfig.disconnect();
        process.exit(0);
    }
}

createTenantLogin();
