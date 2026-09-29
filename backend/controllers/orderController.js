const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');

const errorStatus = (err) => (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500);

// Do not create an order for an online method until a payment gateway confirms it.
const PAYMENT_METHODS = ['Cash on Delivery'];
const CHECKOUT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const STATUS_TRANSITIONS = {
  Pending: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

const validateShippingAddress = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const address = Object.fromEntries(
    ['line1', 'city', 'state', 'pincode', 'phone'].map((key) => [key, String(value[key] || '').trim()])
  );

  if (Object.values(address).some((field) => !field)) return null;
  if (address.line1.length > 180 || address.city.length > 80 || address.state.length > 80) return null;
  if (!/^\d{6}$/.test(address.pincode)) return null;
  if (!/^[0-9+()\-\s]{7,20}$/.test(address.phone)) return null;
  return address;
};

// POST /api/orders  { shippingAddress }  -- places order from current cart
// Note: uses plain sequential writes (no multi-document transaction) so it
// works against a standalone MongoDB instance, not just a replica set.
exports.placeOrder = async (req, res) => {
  let checkoutLocked = false;
  let cartCleared = false;
  let user;
  let originalCart = [];
  const deductedItems = [];

  try {
    const paymentMethod = req.body.paymentMethod || 'Cash on Delivery';
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'Cash on Delivery is the only available payment method' });
    }
    const shippingAddress = validateShippingAddress(req.body.shippingAddress);
    if (!shippingAddress) {
      return res.status(400).json({ message: 'A complete valid shipping address is required' });
    }

    // A user may only submit one checkout at a time. A stale lock can be recovered
    // after a failed request or server restart.
    const staleLock = new Date(Date.now() - CHECKOUT_LOCK_TIMEOUT_MS);
    const lock = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        $or: [{ checkoutLock: null }, { checkoutLock: { $exists: false } }, { checkoutLock: { $lt: staleLock } }],
      },
      { $set: { checkoutLock: new Date() } },
      { new: false }
    );
    if (!lock) return res.status(409).json({ message: 'A checkout is already in progress' });
    checkoutLocked = true;

    user = await User.findById(req.user._id).populate('cart.product');
    if (!user) throw httpError(401, 'User no longer exists');
    if (!user.cart.length) {
      return res.status(400).json({ message: 'Cart is empty' });
    }
    originalCart = user.cart.map((item) => ({ product: item.product._id || item.product, quantity: item.quantity }));

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

      // Conditional, atomic decrement: concurrent checkouts cannot make stock negative.
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: product._id, isActive: true, stock: { $gte: cartItem.quantity } },
        { $inc: { stock: -cartItem.quantity } },
        { new: true }
      );
      if (!updatedProduct) {
        throw httpError(409, `Insufficient stock for ${product.name}`);
      }
      deductedItems.push({ product: product._id, quantity: cartItem.quantity });
    }

    const itemTotal = +(subtotal + totalGst).toFixed(2);
    const deliveryFee = itemTotal >= 2000 ? 0 : 99;
    // Empty the cart before creating the order while the checkout lock is held;
    // this prevents duplicate orders if a client retries a slow request.
    user.cart = [];
    await user.save();
    cartCleared = true;

    const order = await Order.create({
      user: user._id,
      items,
      subtotal: +subtotal.toFixed(2),
      totalGst: +totalGst.toFixed(2),
      totalAmount: +(itemTotal + deliveryFee).toFixed(2),
      deliveryFee,
      paymentMethod,
      shippingAddress,
      status: 'Pending',
    });

    res.status(201).json(order);
  } catch (err) {
    // Sequential writes are used so standalone MongoDB works. Compensate every
    // successful decrement if a later write fails.
    try {
      if (deductedItems.length) {
        await Promise.all(
          deductedItems.map((item) => Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }))
        );
      }
      if (cartCleared && user) {
        user.cart = originalCart;
        await user.save();
      }
    } catch (rollbackError) {
      console.error('Order rollback failed:', rollbackError);
    }
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to place order' });
  } finally {
    if (checkoutLocked) {
      await User.updateOne({ _id: req.user._id }, { $unset: { checkoutLock: 1 } });
    }
  }
};

// GET /api/orders  -- current user's order history
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to fetch orders' });
  }
};

// GET /api/orders/:id -- single order (owner or admin)
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const isOwner = order.user && order.user._id.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }
    res.json(order);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to fetch order' });
  }
};

// ---- Admin only ----

// GET /api/admin/orders
exports.adminGetOrders = async (req, res) => {
  try {
    const { status } = req.query;
    if (status && !Object.hasOwn(STATUS_TRANSITIONS, status)) {
      return res.status(400).json({ message: 'Invalid status filter' });
    }
    const filter = status ? { status } : {};
    const orders = await Order.find(filter).populate('user', 'name email').sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to fetch orders' });
  }
};

// PUT /api/admin/orders/:id/status  { status }
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!Object.hasOwn(STATUS_TRANSITIONS, status)) return res.status(400).json({ message: 'Invalid status' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (status === order.status) return res.json(order);
    if (!STATUS_TRANSITIONS[order.status].includes(status)) {
      return res.status(400).json({ message: `Cannot change ${order.status} orders to ${status}` });
    }

    // Compare-and-set makes a concurrent update fail rather than double-restock stock.
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: order._id, status: order.status },
      { $set: { status } },
      { new: true, runValidators: true }
    );
    if (!updatedOrder) {
      return res.status(409).json({ message: 'This order was updated by another administrator. Refresh and try again.' });
    }

    // The status change is claimed first. Cancelled is terminal, so only the
    // administrator that wins the compare-and-set can restore inventory.
    if (status === 'Cancelled' && order.items.length) {
      try {
        await Product.bulkWrite(order.items.map((item) => ({
          updateOne: { filter: { _id: item.product }, update: { $inc: { stock: item.quantity } } },
        })));
      } catch (err) {
        await Order.updateOne({ _id: order._id, status: 'Cancelled' }, { $set: { status: order.status } });
        throw err;
      }
    }

    res.json(updatedOrder);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to update order status' });
  }
};
