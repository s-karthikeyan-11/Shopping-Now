// One-time script: creates an admin account and a few sample products.
// Run with: npm run seed
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');
const Product = require('./models/Product');

const run = async () => {
  await connectDB();

  const isProduction = process.env.NODE_ENV === 'production';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || (isProduction ? '' : 'admin@example.com');
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isProduction ? '' : 'admin123');
  if (!adminEmail || !adminPassword) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required in production');
  }
  if (isProduction && adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters in production');
  }

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: 'Admin',
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
    });
    console.log(`Created admin account: ${adminEmail}`);
  } else {
    console.log('Admin already exists');
  }

  const count = await Product.countDocuments();
  if (count === 0) {
    await Product.insertMany([
      { name: 'Wireless Mouse', category: 'Electronics', image: 'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=800&q=80', price: 799, discountPercent: 10, gstPercent: 18, stock: 40, lowStockThreshold: 10 },
      { name: 'Mechanical Keyboard', category: 'Electronics', image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80', price: 2999, discountPercent: 15, gstPercent: 18, stock: 20, lowStockThreshold: 5 },
      { name: 'Cotton T-Shirt', category: 'Apparel', image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80', price: 499, discountPercent: 5, gstPercent: 5, stock: 100, lowStockThreshold: 15 },
      { name: 'Running Shoes', category: 'Footwear', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80', price: 2499, discountPercent: 20, gstPercent: 12, stock: 4, lowStockThreshold: 5 },
      { name: 'Coffee Mug', category: 'Home', image: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=800&q=80', price: 299, discountPercent: 0, gstPercent: 12, stock: 60, lowStockThreshold: 10 },
    ]);
    console.log('Seeded sample products');
  } else {
    console.log('Products already exist, skipping');
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
