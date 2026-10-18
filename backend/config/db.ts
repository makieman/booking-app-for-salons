import mongoose from 'mongoose';

/**
 * Connects to MongoDB using the MONGODB_URI environment variable.
 * If no URI is provided, logs a warning and skips the connection.
 */
const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn('⚠️  MONGODB_URI not set in .env — skipping database connection.');
    return;
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    // Keep server running so DB status middleware can handle requests and Mongoose can reconnect
  }
};

export default connectDB;
