const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        // Try MongoDB Atlas first
        const mongoURI =process.env.MONGODB_URI

        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 30000,
            maxPoolSize: 10,      // Pre-establish 10 connections (avoids connection setup delay)
            minPoolSize: 2,       // Keep 2 connections always warm
            compressors: ['zlib'], // Compress data over network (huge for Atlas cloud)
        });

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return true;
    } catch (atlasError) {
        console.warn(
            `⚠️  MongoDB Atlas connection failed: ${atlasError.message}`,
        );

        // Fallback to local MongoDB
        try {
            console.log("Attempting to connect to local MongoDB...");
            const conn = await mongoose.connect(
                "mongodb+srv://mani001:admin@cluster0.tzie1yt.mongodb.net/crm_db?retryWrites=true&w=majority",
                {
                    serverSelectionTimeoutMS: 5000,
                },
            );
            console.log(`✅ Local MongoDB Connected: ${conn.connection.host}`);
            return true;
        } catch (localError) {
            console.error(`❌ Both MongoDB Atlas and Local MongoDB failed`);
            console.error(`Atlas Error: ${atlasError.message}`);
            console.error(`Local Error: ${localError.message}`);
            console.log("\n⚠️  Running without database connection. Please:");
            console.log("   1. Start local MongoDB: mongodb");
            console.log("   2. Or check MongoDB Atlas credentials");
            console.log("   3. Or set MONGODB_URI environment variable");
            return false;
        }
    }
};

module.exports = connectDB;
