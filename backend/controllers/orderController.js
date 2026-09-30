const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const crypto = require('crypto');
const razorpay = require('../config/razorpay');

const errorStatus = (err) => (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500);

const PAYMENT_METHODS = ['Cash on Delivery'];
const CHECKOUT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const STATUS_TRANSITIONS = {
  'Awaiting Payment': ['Cancelled'],
  Pending: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

const getCheckoutLock = async (userId) => {
  const staleLock = new Date(Date.now() - CHECKOUT_LOCK_TIMEOUT_MS);
  return User.findOneAndUpdate(
    {
      _id: userId,
      // null also matches documents created before checkoutLock existed.
      $or: [
        { checkoutLock: null },
        { checkoutLock: mongoose.trusted({ $lt: staleLock }) },
      ],
    },
    { $set: { checkoutLock: new Date() } },
    { new: false }
  );
};

const getCheckoutDetails = async (userId) => {
  const user = await User.findById(userId).populate('cart.product');
  if (!user) throw httpError(401, 'User no longer exists');
  if (!user.cart.length) throw httpError(400, 'Cart is empty');

  const originalCart = user.cart.map((item) => ({ product: item.product._id || item.product, quantity: item.quantity }));
  const items = [];
  let subtotal = 0;
  let totalGst = 0;

  // Validate the complete cart before changing any stock.
  for (const cartItem of user.cart) {
    const product = cartItem.product;
    if (!product || !product.isActive) {
      throw httpError(400, 'A product in your cart is no longer available');
    }
    if (product.stock < cartItem.quantity) {
      throw httpError(400, `Insufficient stock for ${product.name}`);
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
  }

  const itemTotal = +(subtotal + totalGst).toFixed(2);
  const deliveryFee = itemTotal >= 2000 ? 0 : 99;
  return {
    user,
    originalCart,
    items,
    subtotal: +subtotal.toFixed(2),
    totalGst: +totalGst.toFixed(2),
    deliveryFee,
    totalAmount: +(itemTotal + deliveryFee).toFixed(2),
  };
};

const reserveStock = async (items) => {
  const reservedItems = [];
  for (const item of items) {
    // Conditional, atomic decrement prevents concurrent checkouts from
    // overselling a product.
    const updatedProduct = await Product.findOneAndUpdate(
      {
        _id: item.product,
        isActive: true,
        stock: mongoose.trusted({ $gte: item.quantity }),
      },
      { $inc: { stock: -item.quantity } },
      { new: true }
    );
    if (!updatedProduct) throw httpError(409, `Insufficient stock for ${item.name}`);
    reservedItems.push({ product: item.product, quantity: item.quantity });
  }
  return reservedItems;
};

const releaseStock = async (items) => {
  if (!items.length) return;
  await Promise.all(items.map((item) => Product.updateOne(
    { _id: item.product },
    { $inc: { stock: item.quantity } }
  )));
};

const restoreCart = async (userId, items) => {
  if (!items.length) return;
  const user = await User.findById(userId);
  if (!user) return;

  for (const item of items) {
    const existing = user.cart.find((cartItem) => cartItem.product.toString() === item.product.toString());
    if (existing) existing.quantity += item.quantity;
    else user.cart.push({ product: item.product, quantity: item.quantity });
  }
  await user.save();
};

const isValidSignature = (orderId, paymentId, signature) => {
  if (![orderId, paymentId, signature].every((value) => typeof value === 'string' && value.length)) return false;
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const actual = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
};

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
  let checkout;
  let originalCart = [];
  let reservedItems = [];

  try {
    const paymentMethod = req.body.paymentMethod || 'Cash on Delivery';
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'Cash on Delivery is the only available payment method' });
    }
    const shippingAddress = validateShippingAddress(req.body.shippingAddress);
    if (!shippingAddress) {
      return res.status(400).json({ message: 'A complete valid shipping address is required' });
    }

    const lock = await getCheckoutLock(req.user._id);
    if (!lock) return res.status(409).json({ message: 'A checkout is already in progress' });
    checkoutLocked = true;

    checkout = await getCheckoutDetails(req.user._id);
    originalCart = checkout.originalCart;
    reservedItems = await reserveStock(checkout.items);
    // Empty the cart before creating the order while the checkout lock is held;
    // this prevents duplicate orders if a client retries a slow request.
    checkout.user.cart = [];
    await checkout.user.save();
    cartCleared = true;

    const order = await Order.create({
      user: checkout.user._id,
      items: checkout.items,
      subtotal: checkout.subtotal,
      totalGst: checkout.totalGst,
      totalAmount: checkout.totalAmount,
      deliveryFee: checkout.deliveryFee,
      paymentMethod,
      shippingAddress,
      status: 'Pending',
    });

    res.status(201).json(order);
  } catch (err) {
    // Sequential writes are used so standalone MongoDB works. Compensate every
    // successful decrement if a later write fails.
    try {
      await releaseStock(reservedItems);
      if (cartCleared && checkout?.user) {
        checkout.user.cart = originalCart;
        await checkout.user.save();
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

// POST /api/orders/razorpay  { shippingAddress }
// Creates both the local order and Razorpay order from server-calculated cart data.
exports.createRazorpayOrder = async (req, res) => {
  let checkoutLocked = false;
  let cartCleared = false;
  let checkout;
  let localOrder;
  let reservedItems = [];

  try {
    const shippingAddress = validateShippingAddress(req.body.shippingAddress);
    if (!shippingAddress) {
      return res.status(400).json({ message: 'A complete valid shipping address is required' });
    }

    const lock = await getCheckoutLock(req.user._id);
    if (!lock) return res.status(409).json({ message: 'A checkout is already in progress' });
    checkoutLocked = true;

    checkout = await getCheckoutDetails(req.user._id);
    reservedItems = await reserveStock(checkout.items);
    checkout.user.cart = [];
    await checkout.user.save();
    cartCleared = true;

    // Persist the inventory reservation first: an order id is only returned to
    // Checkout after the matching local order exists.
    localOrder = await Order.create({
      user: checkout.user._id,
      items: checkout.items,
      subtotal: checkout.subtotal,
      totalGst: checkout.totalGst,
      totalAmount: checkout.totalAmount,
      deliveryFee: checkout.deliveryFee,
      paymentMethod: 'Razorpay',
      paymentStatus: 'Pending',
      shippingAddress,
      status: 'Awaiting Payment',
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(localOrder.totalAmount * 100),
      currency: 'INR',
      receipt: `shopnow_${localOrder._id}`,
      notes: {
        localOrderId: localOrder._id.toString(),
        userId: checkout.user._id.toString(),
      },
    });

    localOrder.razorpayOrderId = razorpayOrder.id;
    await localOrder.save();

    res.status(201).json({
      orderId: localOrder._id,
      keyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrder: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
    });
  } catch (err) {
    try {
      if (localOrder) await localOrder.deleteOne();
      await releaseStock(reservedItems);
      if (cartCleared && checkout) await restoreCart(checkout.user._id, checkout.originalCart);
    } catch (rollbackError) {
      console.error('Razorpay checkout rollback failed:', rollbackError);
    }
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to start Razorpay payment' });
  } finally {
    if (checkoutLocked) {
      await User.updateOne({ _id: req.user._id }, { $unset: { checkoutLock: 1 } });
    }
  }
};

// POST /api/orders/razorpay/verify
// Verifies the Checkout response using the server-side order id and secret.
exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const { orderId, razorpay_payment_id: paymentId, razorpay_order_id: razorpayOrderId, razorpay_signature: signature } = req.body;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order || order.paymentMethod !== 'Razorpay') {
      return res.status(404).json({ message: 'Razorpay order not found' });
    }
    if (order.paymentStatus === 'Paid') {
      if (order.razorpayPaymentId === paymentId) return res.json({ order });
      return res.status(409).json({ message: 'This order has already been paid' });
    }
    if (order.status !== 'Awaiting Payment' || order.razorpayOrderId !== razorpayOrderId) {
      return res.status(409).json({ message: 'This payment can no longer be verified' });
    }
    if (!isValidSignature(order.razorpayOrderId, paymentId, signature)) {
      return res.status(400).json({ message: 'Payment signature verification failed' });
    }

    // A valid signature proves Checkout generated the response. Fetching the
    // payment also confirms that it belongs to this order, has the exact
    // server-calculated amount, and has been captured by Razorpay.
    const payment = await razorpay.payments.fetch(paymentId);
    const expectedAmount = Math.round(order.totalAmount * 100);
    if (
      payment.order_id !== order.razorpayOrderId
      || payment.amount !== expectedAmount
      || payment.currency !== 'INR'
      || payment.status !== 'captured'
    ) {
      return res.status(409).json({ message: 'Payment is not captured for this order yet' });
    }

    const paidOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        user: req.user._id,
        status: 'Awaiting Payment',
        paymentStatus: 'Pending',
        razorpayOrderId: order.razorpayOrderId,
      },
      {
        $set: {
          status: 'Pending',
          paymentStatus: 'Paid',
          razorpayPaymentId: paymentId,
          razorpaySignature: signature,
          paidAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );
    if (!paidOrder) {
      return res.status(409).json({ message: 'This payment is already being processed. Refresh the order history.' });
    }

    res.json({ order: paidOrder });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: 'This payment is already linked to another order' });
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to verify Razorpay payment' });
  }
};

// POST /api/orders/:id/payment/cancel
// Called only when Checkout is dismissed or reports a failed payment. It first
// checks Razorpay so an already captured payment can never be released.
exports.cancelRazorpayPayment = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order || order.paymentMethod !== 'Razorpay') {
      return res.status(404).json({ message: 'Razorpay order not found' });
    }
    if (order.paymentStatus === 'Paid') return res.status(409).json({ message: 'This order has already been paid' });
    if (order.status !== 'Awaiting Payment') {
      return res.status(409).json({ message: 'This payment can no longer be cancelled' });
    }

    const gatewayPayments = await razorpay.orders.fetchPayments(order.razorpayOrderId);
    const payments = Array.isArray(gatewayPayments) ? gatewayPayments : gatewayPayments.items || [];
    if (payments.some((payment) => ['authorized', 'captured'].includes(payment.status))) {
      return res.status(409).json({ message: 'A payment is being confirmed. Do not attempt to pay again.' });
    }

    const cancelledOrder = await Order.findOneAndUpdate(
      { _id: order._id, status: 'Awaiting Payment', paymentStatus: 'Pending' },
      { $set: { status: 'Cancelled', paymentStatus: 'Failed' } },
      { new: true, runValidators: true }
    );
    if (!cancelledOrder) {
      return res.status(409).json({ message: 'This payment is already being processed. Refresh the order history.' });
    }

    try {
      await releaseStock(order.items);
      await restoreCart(req.user._id, order.items);
    } catch (err) {
      await Order.updateOne(
        { _id: order._id, status: 'Cancelled', paymentStatus: 'Failed' },
        { $set: { status: 'Awaiting Payment', paymentStatus: 'Pending' } }
      );
      throw err;
    }

    res.json({ order: cancelledOrder });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to cancel Razorpay payment' });
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
