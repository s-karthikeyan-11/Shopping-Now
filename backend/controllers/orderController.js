const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');

// POST /api/orders  { shippingAddress }  -- places order from current cart
// Note: uses plain sequential writes (no multi-document transaction) so it
// works against a standalone MongoDB instance, not just a replica set.
exports.placeOrder = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('cart.product');
    if (!user.cart.length) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const items = [];
    let subtotal = 0;
    let totalGst = 0;

    // Validate everything first so we don't partially deduct stock on failure
    for (const cartItem of user.cart) {
      const product = cartItem.product;
      if (!product || !product.isActive) {
        return res.status(400).json({ message: 'A product in your cart is no longer available' });
      }
      if (product.stock < cartItem.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }
    }

    for (const cartItem of user.cart) {
      const product = cartItem.product;
      const discounted = +(product.price - (product.price * product.discountPercent) / 100).toFixed(2);
      const gstAmount = +((discounted * product.gstPercent) / 100).toFixed(2);
      const finalPrice = +(discounted + gstAmount).toFixed(2);
      const lineTotal = +(finalPrice * cartItem.quantity).toFixed(2);

      items.push({
        product: product._id,
        name: product.name,
        quantity: cartItem.quantity,
        price: product.price,
        discountPercent: product.discountPercent,
        gstPercent: product.gstPercent,
        finalPrice,
        lineTotal,
      });

      subtotal += discounted * cartItem.quantity;
      totalGst += gstAmount * cartItem.quantity;

      product.stock -= cartItem.quantity;
      await product.save();
    }

    const order = await Order.create({
      user: user._id,
      items,
      subtotal: +subtotal.toFixed(2),
      totalGst: +totalGst.toFixed(2),
      totalAmount: +(subtotal + totalGst).toFixed(2),
      shippingAddress: req.body.shippingAddress || {},
      status: 'Pending',
    });

    user.cart = [];
    await user.save();

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to place order', error: err.message });
  }
};

// GET /api/orders  -- current user's order history
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
  }
};

// GET /api/orders/:id -- single order (owner or admin)
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const isOwner = order.user._id.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch order', error: err.message });
  }
};

// ---- Admin only ----

// GET /api/admin/orders
exports.adminGetOrders = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const orders = await Order.find(filter).populate('user', 'name email').sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch orders', error: err.message });
  }
};

// PUT /api/admin/orders/:id/status  { status }
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Restock items if cancelling an order that wasn't already cancelled
    if (status === 'Cancelled' && order.status !== 'Cancelled') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
      }
    }

    order.status = status;
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update order status', error: err.message });
  }
};
