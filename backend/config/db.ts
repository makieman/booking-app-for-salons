import mongoose from 'mongoose';

let isConnecting = false;
let reconnectListenerRegistered = false;

/**
 * Re-connects if the connection drops AFTER the app has connected once.
 * Registered lazily (not at import time) so scripts and tests that import this file and then
 * disconnect on purpose never trigger a reconnect to the production database.
 */
function registerReconnectListener(): void {
  if (reconnectListenerRegistered) return;
  reconnectListenerRegistered = true;
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected. Attempting auto-reconnection...');
    if (process.env.MONGODB_URI && mongoose.connection.readyState === 0 && !isConnecting) {
      connectDB(3, 2000).catch((err) => {
        console.error('❌ Reconnection attempt failed:', err instanceof Error ? err.message : err);
      });
    }
  });
}

/**
 * Connects to MongoDB using the MONGODB_URI environment variable with automatic retries.
 * If no URI is provided, logs a warning and skips the connection.
 */
const connectDB = async (retries = 5, delayMs = 3000): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn('⚠️  MONGODB_URI not set in .env — skipping database connection.');
    return;
  }

  if (mongoose.connection.readyState === 1 || isConnecting) {
    return;
  }

  isConnecting = true;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('✅ Connected to MongoDB');
      registerReconnectListener();
      isConnecting = false;
      return;
    } catch (error) {
      console.error(
        `❌ MongoDB connection attempt ${attempt}/${retries} failed:`,
        error instanceof Error ? error.message : error
      );
      if (attempt < retries) {
        console.log(`⏳ Retrying MongoDB connection in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  isConnecting = false;
  console.error('❌ All initial MongoDB connection attempts failed. Auto-reconnection will trigger on incoming requests.');
};

export default connectDB;
