// One-time catalog repair for legacy blank or malformed product image URLs.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');
const { getDefaultProductImage, normalizeProductImage } = require('../config/productImage');

const run = async () => {
  await connectDB();
  const products = await Product.find().select('_id category image').lean();
  const updates = products.flatMap((product) => {
    let image;
    try {
      image = normalizeProductImage(product.image, product.category);
    } catch {
      image = getDefaultProductImage(product.category);
    }
    return image === product.image
      ? []
      : [{ updateOne: { filter: { _id: product._id }, update: { $set: { image } } } }];
  });

  if (updates.length) await Product.bulkWrite(updates, { ordered: false });
  console.log(`Repaired ${updates.length} product image URL${updates.length === 1 ? '' : 's'}`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('Could not repair product images:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
