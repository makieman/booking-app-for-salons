import mongoose from 'mongoose';

let isConnecting = false;

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

// Reconnection listener if connection drops after initial success
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected. Attempting auto-reconnection...');
  const uri = process.env.MONGODB_URI;
  if (uri && mongoose.connection.readyState === 0 && !isConnecting) {
    connectDB(3, 2000).catch((err) => {
      console.error('❌ Reconnection attempt failed:', err instanceof Error ? err.message : err);
    });
  }
});

export default connectDB;
