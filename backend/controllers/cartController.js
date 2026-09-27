const User = require('../models/User');
const Product = require('../models/Product');

const populateCart = (user) => user.populate('cart.product');

const buildCartResponse = (user) => {
  const items = user.cart
    .filter((item) => item.product) // drop items whose product was deleted
    .map((item) => {
      const p = item.product;
      return {
        product: p,
        quantity: item.quantity,
        lineTotal: +(p.finalPrice * item.quantity).toFixed(2),
      };
    });
  const total = +items.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2);
  return { items, total };
};

// GET /api/cart
exports.getCart = async (req, res) => {
  try {
    const user = await populateCart(req.user);
    res.json(buildCartResponse(user));
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch cart', error: err.message });
  }
};

// POST /api/cart  { productId, quantity }
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const product = await Product.findById(productId);
    if (!product || !product.isActive) return res.status(404).json({ message: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ message: 'Not enough stock' });

    const user = req.user;
    const existing = user.cart.find((i) => i.product.toString() === productId);
    if (existing) {
      existing.quantity += Number(quantity);
    } else {
      user.cart.push({ product: productId, quantity });
    }
    await user.save();
    const populated = await populateCart(user);
    res.status(201).json(buildCartResponse(populated));
  } catch (err) {
    res.status(500).json({ message: 'Failed to add to cart', error: err.message });
  }
};

// PUT /api/cart/:productId  { quantity }
exports.updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity == null || quantity < 1) return res.status(400).json({ message: 'Quantity must be at least 1' });

    const user = req.user;
    const item = user.cart.find((i) => i.product.toString() === req.params.productId);
    if (!item) return res.status(404).json({ message: 'Item not in cart' });

    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ message: 'Not enough stock' });

    item.quantity = quantity;
    await user.save();
    const populated = await populateCart(user);
    res.json(buildCartResponse(populated));
  } catch (err) {
    res.status(500).json({ message: 'Failed to update cart item', error: err.message });
  }
};

// DELETE /api/cart/:productId
exports.removeCartItem = async (req, res) => {
  try {
    const user = req.user;
    user.cart = user.cart.filter((i) => i.product.toString() !== req.params.productId);
    await user.save();
    const populated = await populateCart(user);
    res.json(buildCartResponse(populated));
  } catch (err) {
    res.status(500).json({ message: 'Failed to remove cart item', error: err.message });
  }
};
