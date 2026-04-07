// src/api/config/database.ts
import mongoose from "mongoose";
import bcrypt from 'bcryptjs';
import User from '../models/User';
import { refreshStoreSettingsCache } from '../utils/storeSettingsService';

const getMongoURI = (): string => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn("⚠️  MONGO_URI not set. Set it to your MongoDB Atlas connection string (Atlas → Database → Connect → Drivers).");
    console.warn("   Using fallback: mongodb://127.0.0.1:27017/battery_store_new_client");
    return "mongodb://127.0.0.1:27017/battery_store_new_client";
  }
  return uri;
};

const seedAdminUser = async () => {
  try {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) { console.warn("⚠️  ADMIN_PASSWORD not set. Skipping default admin seed for safety."); return; }

    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return;
    }
    console.log("No users found. Seeding default admin user...");
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);
    const admin = new User({
      username: adminUsername,
      password: hashedPassword,
      role: "admin",
      // @ts-ignore
      status: "active"
    });
    await admin.save();
    console.log(`Admin user created successfully with username: ${adminUsername}`);
  } catch (err: any) {
    console.error("Error seeding admin user:", err.message);
  }
};


export const connectDB = async () => {
  try {
    const mongoURI = getMongoURI();
    console.log("🔗 Attempting to connect to MongoDB...");
    console.log("📍 Connection string:", mongoURI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));

    await mongoose.connect(mongoURI);
    console.log("✅ MongoDB connected successfully");

    await seedAdminUser();
    await refreshStoreSettingsCache();

  } catch (err: any) {
    console.error("❌ MongoDB connection error:", err.message);

    if (err.message.includes("whitelist") || err.message.includes("IP")) {
      console.error("\n💡 TIP: Your IP address may not be whitelisted in MongoDB Atlas.");
      console.error("   Go to: MongoDB Atlas Dashboard > Network Access > Add IP Address");
      console.error("   Or whitelist 0.0.0.0/0 for development (less secure)\n");
    }
  }
};
