const Product = require('../models/Product');

// GET /api/products  (public) - list active products, with optional search/category filter
exports.getProducts = async (req, res) => {
  try {
    const { search, category } = req.query;
    const filter = { isActive: true };
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (category) filter.category = category;
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch products', error: err.message });
  }
};

// GET /api/products/:id (public)
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch product', error: err.message });
  }
};

// ---- Admin only below ----

// GET /api/admin/products (includes inactive)
exports.adminGetProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch products', error: err.message });
  }
};

// POST /api/admin/products
exports.createProduct = async (req, res) => {
  try {
    const { name, description, category, image, price, discountPercent, gstPercent, stock, lowStockThreshold } = req.body;
    if (!name || price == null || stock == null) {
      return res.status(400).json({ message: 'name, price and stock are required' });
    }
    const product = await Product.create({
      name, description, category, image,
      price, discountPercent, gstPercent, stock, lowStockThreshold,
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create product', error: err.message });
  }
};

// PUT /api/admin/products/:id  (edit details, price, discount, gst, stock)
exports.updateProduct = async (req, res) => {
  try {
    const updates = (({ name, description, category, image, price, discountPercent, gstPercent, stock, lowStockThreshold, isActive }) =>
      ({ name, description, category, image, price, discountPercent, gstPercent, stock, lowStockThreshold, isActive }))(req.body);

    Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

    const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update product', error: err.message });
  }
};

// DELETE /api/admin/products/:id
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete product', error: err.message });
  }
};
