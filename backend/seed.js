// One-time script: creates an admin account and a few sample products.
// Run with: npm run seed
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');
const Product = require('./models/Product');

const run = async () => {
  await connectDB();

  const adminEmail = 'admin@example.com';
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: 'Admin',
      email: adminEmail,
      password: 'admin123',
      role: 'admin',
    });
    console.log('Created admin -> email: admin@example.com  password: admin123');
  } else {
    console.log('Admin already exists');
  }

  const count = await Product.countDocuments();
  if (count === 0) {
    await Product.insertMany([
      { name: 'Wireless Mouse', category: 'Electronics', price: 799, discountPercent: 10, gstPercent: 18, stock: 40, lowStockThreshold: 10 },
      { name: 'Mechanical Keyboard', category: 'Electronics', price: 2999, discountPercent: 15, gstPercent: 18, stock: 20, lowStockThreshold: 5 },
      { name: 'Cotton T-Shirt', category: 'Apparel', price: 499, discountPercent: 5, gstPercent: 5, stock: 100, lowStockThreshold: 15 },
      { name: 'Running Shoes', category: 'Footwear', price: 2499, discountPercent: 20, gstPercent: 12, stock: 4, lowStockThreshold: 5 },
      { name: 'Coffee Mug', category: 'Home', price: 299, discountPercent: 0, gstPercent: 12, stock: 60, lowStockThreshold: 10 },
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
