const mongoose = require('mongoose');
const config = require('./config');

const {
    server: { mongoHost, mongoPort, db, poolSize, environment, mongoProdUrl }
} = config;

let mongoUrl = `mongodb://${mongoHost}:${mongoPort}/${db}?maxPoolSize=${poolSize}`;


if (environment === "PROD") {
    mongoUrl = `${mongoProdUrl}/${db}`
}

let isConnected = false;

exports.connect = async () => {
    try {
        if (isConnected) {
            console.log('ℹ️ MongoDB already connected');
            return;
        }

        mongoose.set('strictQuery', true);

        await mongoose.connect(mongoUrl, {
            maxPoolSize: poolSize,
            serverSelectionTimeoutMS: 10000
        });

        isConnected = true;

        console.log(`✅ MongoDB connected successfully`);
        console.log(`✅ Worker PID: [ ${process.pid} ]`);
        console.log(`✅ Database name: [ ${db} ]`);
        console.log(`✅ Current time: [ ${new Date().toJSON()} ]`);

        console.log('========= Project Setup Successfully =======\n\n');
    } catch (error) {
        console.error('❌ MongoDB connection failed. Exiting now...');
        console.error(error);
        process.exit(1);
    }
};

exports.disconnect = async () => {
    if (isConnected) {
        await mongoose.disconnect();
        isConnected = false;
        console.log('✅ MongoDB disconnected');
    }
};