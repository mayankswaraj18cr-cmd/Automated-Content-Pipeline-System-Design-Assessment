const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[DB] MongoDB Connected Successfully');
  } catch (err) {
    console.error('[DB Error] Connection failed:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
