const mongoose = require('mongoose');

const connectDB = async () => {
  mongoose.set('sanitizeFilter', true);
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log('MongoDB connected');
    return true;
  } catch (error) {
    console.warn('MongoDB unavailable; starting in degraded demo mode.', error.message);
    return false;
  }
};

module.exports = connectDB;
