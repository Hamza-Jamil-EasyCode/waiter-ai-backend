const config = {
    server: {
        mongoHost: process.env.MONGO_DB_HOST || '127.0.0.1',
        mongoPort: parseInt(process.env.MONGO_DB_PORT || '27017'),
        mongoDb: process.env.MONGO_DB,
        poolSize: process.env.MONGO_POOL_SIZE || '100',
        route: process.env.ROUTE || 'api',
        port: process.env.PORT || '4000',
        jwtSecretKey: process.env.JWT_SECRET,
        db: process.env.MONGO_DB || 'template',
        clientLink: process.env.UI_LINK || '',
        backendLink: process.env.BACKEND_LINK || '',
        smtpMail: process.env.SMTP_MAIL || '',
        smtpPassword: process.env.SMTP_PASS || '',
        environment: process.env.NODE_ENV,
        clusterSize: process.env.CLUSTER_SIZE || 2,
        mongoProdUrl: process.env.MONGO_URI_PROD,

        accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || 'your_access_token_secret',
        refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || 'your_refresh_token_secret',
        magicLinkSecret: process.env.MAGIC_LINK_SECRET || 'your_magic_link_secret',

        superAdminFirstName: 'John',
        superAdminLastName: 'Doe',
        superAdminEmail: 'superadmin@gmail.com',
        superAdminPassword: 'Admin@123',

        s3AccessKey: process.env.S3_ACCESS_KEY || "s3-access-key",
        s3SecretKey: process.env.S3_SECRET_KEY || "s3-secret-key",
        s3BucketName: process.env.S3_BUCKET_NAME || "s3-bucket-name",
        s3Region: process.env.S3_REGION || "s3-region",

    }
};

module.exports = config;
