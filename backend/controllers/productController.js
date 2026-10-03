const Product = require('../models/Product');
const mongoose = require('mongoose');
const { normalizeProductImage } = require('../config/productImage');

const errorStatus = (err) => (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const getQueryText = (value) => (typeof value === 'string' ? value.trim() : '');

// GET /api/products/seller/me  (seller only)
exports.getSellerProducts = async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user._id }).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to fetch seller products' });
  }
};

// POST /api/products/seller
exports.createSellerProduct = async (req, res) => {
  try {
    const { name, description, category, image, price, discountPercent, gstPercent, stock, lowStockThreshold } = req.body;
    if (!name || price == null || stock == null) {
      return res.status(400).json({ message: 'name, price and stock are required' });
    }

    let productImage;
    try {
      productImage = normalizeProductImage(image, category);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const product = await Product.create({
      name,
      description,
      category,
      image: productImage,
      price,
      discountPercent,
      gstPercent,
      stock,
      lowStockThreshold,
      seller: req.user._id,
      sellerName: req.user.name,
    });

    res.status(201).json(product);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to create seller product' });
  }
};

// PUT /api/products/seller/:id
exports.updateSellerProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, seller: req.user._id });
    if (!product) return res.status(404).json({ message: 'Seller product not found' });

    const updates = (({ name, description, category, image, price, discountPercent, gstPercent, stock, lowStockThreshold, isActive }) => ({
      name, description, category, image, price, discountPercent, gstPercent, stock, lowStockThreshold, isActive,
    }))(req.body);

    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
    if (Object.hasOwn(updates, 'image')) {
      try {
        updates.image = normalizeProductImage(updates.image, updates.category || product.category);
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
    }

    Object.assign(product, updates);
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to update seller product' });
  }
};

// DELETE /api/products/seller/:id
exports.deleteSellerProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, seller: req.user._id });
    if (!product) return res.status(404).json({ message: 'Seller product not found' });

    product.isActive = false;
    await product.save();
    res.json({ message: 'Product archived' });
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to archive seller product' });
  }
};

// GET /api/products  (public) - list active products, with optional search/category filter
exports.getProducts = async (req, res) => {
  try {
    const search = getQueryText(req.query.search);
    const category = getQueryText(req.query.category);
    if (search.length > 100 || category.length > 60) {
      return res.status(400).json({ message: 'Search and category filters are too long' });
    }
    const filter = { isActive: true };
    // sanitizeFilter is globally enabled. Search across the fields customers
    // can see, using an escaped regular expression so search text is literal.
    if (search) {
      const searchPattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = mongoose.trusted([
        { name: searchPattern },
        { description: searchPattern },
        { category: searchPattern },
      ]);
    }
    if (category) filter.category = category;
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to fetch products' });
  }
};

// GET /api/products/:id (public)
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, isActive: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to fetch product' });
  }
};

// ---- Admin only below ----

// GET /api/admin/products (includes inactive)
exports.adminGetProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to fetch products' });
  }
};

// POST /api/admin/products
exports.createProduct = async (req, res) => {
  try {
    const { name, description, category, image, price, discountPercent, gstPercent, stock, lowStockThreshold } = req.body;
    if (!name || price == null || stock == null) {
      return res.status(400).json({ message: 'name, price and stock are required' });
    }
    let productImage;
    try {
      productImage = normalizeProductImage(image, category);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
    const product = await Product.create({
      name, description, category, image: productImage,
      price, discountPercent, gstPercent, stock, lowStockThreshold,
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to create product' });
  }
};

// PUT /api/admin/products/:id  (edit details, price, discount, gst, stock)
exports.updateProduct = async (req, res) => {
  try {
    const updates = (({ name, description, category, image, price, discountPercent, gstPercent, stock, lowStockThreshold, isActive }) =>
      ({ name, description, category, image, price, discountPercent, gstPercent, stock, lowStockThreshold, isActive }))(req.body);

    Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);
    if (Object.hasOwn(updates, 'image')) {
      try {
        updates.image = normalizeProductImage(updates.image, updates.category);
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to update product' });
  }
};

// DELETE /api/admin/products/:id
exports.deleteProduct = async (req, res) => {
  try {
    // Archive rather than hard-delete so historical orders and carts retain a valid reference.
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, isActive: true },
      { isActive: false },
      { new: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product archived' });
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to archive product' });
  }
};
