const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const Package = require('../models/Package');
const SellerProfile = require('../models/SellerProfile');
const mongoose = require('mongoose');
const crypto = require('crypto');
const razorpay = require('../config/razorpay');
const { creditCashback, reverseCashback } = require('../services/walletLedger');
const shippingProvider = require('../services/shippingProvider');

const errorStatus = (err) => (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500);

const PAYMENT_METHODS = ['Cash on Delivery'];
const CHECKOUT_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const STATUS_TRANSITIONS = {
  'Awaiting Payment': ['Cancelled'],
  Pending: ['Processing', 'Cancelled'],
  'Cancellation Pending': [],
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

const buildSellerShipments = (items) => {
  const groupedItems = new Map();
  for (const item of items) {
    if (!item.seller) continue;
    const sellerId = String(item.seller);
    const sellerItems = groupedItems.get(sellerId) || [];
    sellerItems.push({
      product: item.product,
      name: item.name,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    });
    groupedItems.set(sellerId, sellerItems);
  }
  return [...groupedItems].map(([seller, sellerItems]) => ({ seller, items: sellerItems, status: 'Pending' }));
};

const getCouponDiscount = async (code, eligibleAmount, userId) => {
  if (typeof code !== 'string' || !code.trim()) return { code: '', discount: 0, cashbackPercent: 0 };
  const normalizedCode = code.trim().toUpperCase();
  if (normalizedCode.length > 32) throw httpError(400, 'Coupon code is invalid or inactive');

  const coupon = await Coupon.findOne({ code: normalizedCode, isActive: true });
  if (!coupon) throw httpError(400, 'Coupon code is invalid or inactive');
  const now = new Date();
  if (now < coupon.startsAt || now > coupon.expiresAt) throw httpError(400, 'This promotion is not currently available');
  if (coupon.maxRedemptions && coupon.redemptionCount >= coupon.maxRedemptions) throw httpError(400, 'This promotion has reached its redemption limit');
  if (userId && coupon.perUserLimit) {
    const userRedemptions = await Order.countDocuments({
      user: userId,
      coupon: coupon._id,
      couponRedemptionStatus: mongoose.trusted({ $in: ['Reserved', 'Redeemed'] }),
    });
    if (userRedemptions >= coupon.perUserLimit) throw httpError(400, 'You have reached this promotion’s per-customer limit');
  }
  if (eligibleAmount < coupon.minOrderAmount) {
    throw httpError(400, `This promotion requires an order of at least ₹${coupon.minOrderAmount.toFixed(2)}`);
  }

  const rawDiscount = coupon.discountType === 'percentage'
    ? eligibleAmount * coupon.discountValue / 100
    : coupon.discountValue;
  const cappedDiscount = coupon.maxDiscount ? Math.min(rawDiscount, coupon.maxDiscount) : rawDiscount;
  return {
    couponId: coupon._id,
    code: coupon.code,
    discount: Math.min(eligibleAmount, Math.round(cappedDiscount * 100) / 100),
    cashbackPercent: coupon.cashbackPercent || 0,
  };
};

const reserveCouponRedemption = async (order, checkout) => {
  if (!checkout.couponId) return;
  const coupon = await Coupon.findById(checkout.couponId);
  const now = new Date();
  if (!coupon || !coupon.isActive || now < coupon.startsAt || now > coupon.expiresAt) {
    throw httpError(409, 'This promotion is no longer available');
  }

  if (coupon.perUserLimit) {
    const userRedemptions = await Order.countDocuments({
      _id: mongoose.trusted({ $ne: order._id }),
      user: order.user,
      coupon: coupon._id,
      couponRedemptionStatus: mongoose.trusted({ $in: ['Reserved', 'Redeemed'] }),
    });
    if (userRedemptions >= coupon.perUserLimit) throw httpError(409, 'You have reached this promotion’s per-customer limit');
  }

  const filter = {
    _id: coupon._id,
    isActive: true,
    startsAt: mongoose.trusted({ $lte: now }),
    expiresAt: mongoose.trusted({ $gte: now }),
  };
  if (coupon.maxRedemptions) filter.redemptionCount = mongoose.trusted({ $lt: coupon.maxRedemptions });
  const reservedCoupon = await Coupon.findOneAndUpdate(filter, { $inc: { redemptionCount: 1 } }, { new: true });
  if (!reservedCoupon) throw httpError(409, 'This promotion has reached its redemption limit');

  try {
    order.coupon = coupon._id;
    order.couponRedemptionStatus = order.paymentMethod === 'Razorpay' ? 'Reserved' : 'Redeemed';
    await order.save();
  } catch (err) {
    await Coupon.updateOne({ _id: coupon._id }, { $inc: { redemptionCount: -1 } });
    throw err;
  }
};

const releaseCouponRedemption = async (orderId) => {
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      coupon: mongoose.trusted({ $exists: true }),
      couponRedemptionStatus: mongoose.trusted({ $in: ['Reserved', 'Redeemed'] }),
    },
    { $set: { couponRedemptionStatus: 'Released' } },
    { new: true }
  );
  if (order) await Coupon.updateOne({ _id: order.coupon }, { $inc: { redemptionCount: -1 } });
};

const getCheckoutDetails = async (userId, couponCode) => {
  const user = await User.findById(userId).populate('cart.product');
  if (!user) throw httpError(401, 'User no longer exists');
  if (!user.cart.length) throw httpError(400, 'Cart is empty');

  const originalCart = user.cart.map((item) => ({ product: item.product._id || item.product, quantity: item.quantity }));
  const items = [];
  let subtotal = 0;
  let totalGst = 0;
  const sellerIds = [...new Set(user.cart.map((item) => item.product?.seller && String(item.product.seller)).filter(Boolean))];
  const sellerProfiles = sellerIds.length
    ? await SellerProfile.find({ user: mongoose.trusted({ $in: sellerIds }) }).select('user commissionRate').lean()
    : [];
  const commissionBySeller = new Map(sellerProfiles.map((profile) => [String(profile.user), Number(profile.commissionRate ?? 8)]));

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
      ...(product.seller ? { seller: product.seller, commissionRate: commissionBySeller.get(String(product.seller)) ?? 8 } : {}),
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
  const coupon = await getCouponDiscount(couponCode, itemTotal, userId);
  return {
    user,
    originalCart,
    items,
    subtotal: +subtotal.toFixed(2),
    totalGst: +totalGst.toFixed(2),
    deliveryFee,
    couponId: coupon.couponId,
    couponCode: coupon.code,
    couponDiscount: coupon.discount,
    cashbackAmount: Math.round(Math.max(0, itemTotal - coupon.discount) * coupon.cashbackPercent) / 100,
    totalAmount: +(itemTotal - coupon.discount + deliveryFee).toFixed(2),
  };
};

exports.validateCheckoutCoupon = async (req, res) => {
  try {
    const checkout = await getCheckoutDetails(req.user._id, req.body.code);
    if (!checkout.couponCode) return res.status(400).json({ message: 'Enter a promotion code' });
    res.json({
      code: checkout.couponCode,
      discount: checkout.couponDiscount,
      cashbackAmount: checkout.cashbackAmount,
      subtotal: checkout.subtotal,
      tax: checkout.totalGst,
      deliveryFee: checkout.deliveryFee,
      totalAmount: checkout.totalAmount,
    });
  } catch (err) {
    res.status(err.status || errorStatus(err)).json({ message: err.status ? err.message : 'Could not validate this promotion' });
  }
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
  let createdOrder;
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

    checkout = await getCheckoutDetails(req.user._id, req.body.couponCode);
    originalCart = checkout.originalCart;
    reservedItems = await reserveStock(checkout.items);
    // Empty the cart before creating the order while the checkout lock is held;
    // this prevents duplicate orders if a client retries a slow request.
    checkout.user.cart = [];
    await checkout.user.save();
    cartCleared = true;

    createdOrder = await Order.create({
      user: checkout.user._id,
      items: checkout.items,
      sellerShipments: buildSellerShipments(checkout.items),
      subtotal: checkout.subtotal,
      totalGst: checkout.totalGst,
      totalAmount: checkout.totalAmount,
      deliveryFee: checkout.deliveryFee,
      coupon: checkout.couponId,
      couponCode: checkout.couponCode,
      couponDiscount: checkout.couponDiscount,
      cashbackAmount: checkout.cashbackAmount,
      paymentMethod,
      shippingAddress,
      status: 'Pending',
    });
    await reserveCouponRedemption(createdOrder, checkout);

    res.status(201).json(createdOrder);
  } catch (err) {
    // Sequential writes are used so standalone MongoDB works. Compensate every
    // successful decrement if a later write fails.
    try {
      if (createdOrder) {
        await releaseCouponRedemption(createdOrder._id);
        await createdOrder.deleteOne();
      }
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

    checkout = await getCheckoutDetails(req.user._id, req.body.couponCode);
    reservedItems = await reserveStock(checkout.items);
    checkout.user.cart = [];
    await checkout.user.save();
    cartCleared = true;

    // Persist the inventory reservation first: an order id is only returned to
    // Checkout after the matching local order exists.
    localOrder = await Order.create({
      user: checkout.user._id,
      items: checkout.items,
      sellerShipments: buildSellerShipments(checkout.items),
      subtotal: checkout.subtotal,
      totalGst: checkout.totalGst,
      totalAmount: checkout.totalAmount,
      deliveryFee: checkout.deliveryFee,
      coupon: checkout.couponId,
      couponCode: checkout.couponCode,
      couponDiscount: checkout.couponDiscount,
      cashbackAmount: checkout.cashbackAmount,
      paymentMethod: 'Razorpay',
      paymentStatus: 'Pending',
      shippingAddress,
      status: 'Awaiting Payment',
    });
    await reserveCouponRedemption(localOrder, checkout);

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
      if (localOrder) {
        await releaseCouponRedemption(localOrder._id);
        await localOrder.deleteOne();
      }
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
          ...(order.coupon ? { couponRedemptionStatus: 'Redeemed' } : {}),
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
      await releaseCouponRedemption(order._id);
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

// POST /api/orders/:id/cancel -- customer can cancel only before fulfilment starts.
// A paid Razorpay order is refunded before inventory is returned to stock.
exports.cancelMyOrder = async (req, res) => {
  let claimedOrder;
  let refund;

  try {
    const existingOrder = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!existingOrder) return res.status(404).json({ message: 'Order not found' });
    if (existingOrder.status !== 'Pending') {
      return res.status(409).json({ message: 'Only pending orders can be cancelled' });
    }

    // Claim the cancellation before contacting Razorpay. This prevents an
    // administrator from dispatching an order while its refund is in progress.
    claimedOrder = await Order.findOneAndUpdate(
      { _id: existingOrder._id, user: req.user._id, status: 'Pending' },
      { $set: { status: 'Cancellation Pending' } },
      { new: true, runValidators: true }
    );
    if (!claimedOrder) {
      return res.status(409).json({ message: 'This order was updated. Refresh and try again.' });
    }

    if (claimedOrder.paymentMethod === 'Razorpay' && claimedOrder.paymentStatus === 'Paid') {
      if (!claimedOrder.razorpayPaymentId) {
        throw httpError(409, 'The payment record is incomplete. Please contact support to cancel this order.');
      }
      refund = await razorpay.payments.refund(claimedOrder.razorpayPaymentId, {
        amount: Math.round(claimedOrder.totalAmount * 100),
        receipt: `refund_${claimedOrder._id}`,
        notes: { localOrderId: claimedOrder._id.toString(), reason: 'customer_cancelled' },
      });
      if (refund.status === 'failed') {
        await Order.updateOne(
          { _id: claimedOrder._id, status: 'Cancellation Pending' },
          {
            $set: {
              status: 'Pending',
              razorpayRefundId: refund.id,
              refundStatus: 'Failed',
            },
          }
        );
        return res.status(502).json({ message: 'Razorpay could not process the refund. Please try again later.' });
      }
    }

    await releaseStock(claimedOrder.items);
    const paymentUpdate = refund
      ? {
        paymentStatus: refund.status === 'processed' ? 'Refunded' : 'Refund Pending',
        razorpayRefundId: refund.id,
        refundStatus: refund.status === 'processed' ? 'Processed' : 'Pending',
        refundInitiatedAt: new Date(),
      }
      : {};
    const cancelledOrder = await Order.findOneAndUpdate(
      { _id: claimedOrder._id, status: 'Cancellation Pending' },
      { $set: { status: 'Cancelled', ...paymentUpdate } },
      { new: true, runValidators: true }
    );
    if (!cancelledOrder) {
      throw httpError(500, 'Order cancellation could not be finalised. Please contact support.');
    }
    await releaseCouponRedemption(cancelledOrder._id);

    res.json({
      order: cancelledOrder,
      message: refund
        ? refund.status === 'processed' ? 'Order cancelled and refund processed.' : 'Order cancelled and refund initiated.'
        : 'Order cancelled.',
    });
  } catch (err) {
    // If the gateway rejected the refund before creating one, make the order
    // available again. A created refund must never be rolled back locally.
    if (claimedOrder && !refund) {
      await Order.updateOne(
        { _id: claimedOrder._id, status: 'Cancellation Pending' },
        { $set: { status: 'Pending' } }
      ).catch(() => {});
    }
    res.status(err.status || 500).json({
      message: err.status ? err.message : 'Unable to cancel this order. Please try again later.',
    });
  }
};

// POST /api/orders/:id/return -- customers can request a return within 24 hours of delivery.
exports.requestOrderReturn = async (req, res) => {
  const validReasons = ['Damaged or defective', 'Wrong item received', 'Item not as described', 'Changed my mind', 'Other'];
  const { reason } = req.body;
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ message: 'Choose a valid return reason' });
  }

  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'Delivered') {
      return res.status(409).json({ message: 'Only delivered orders can be returned' });
    }

    const deliveryDate = order.deliveredAt || order.updatedAt;
    const returnWindowMs = 24 * 60 * 60 * 1000;
    if (Date.now() - deliveryDate.getTime() > returnWindowMs) {
      return res.status(409).json({ message: 'The 24-hour return window has closed' });
    }

    const updatedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        user: req.user._id,
        status: 'Delivered',
        $or: [
          { 'returnRequest.status': 'Not Requested' },
          { 'returnRequest.status': mongoose.trusted({ $exists: false }) },
        ],
      },
      {
        $set: {
          'returnRequest.status': 'Requested',
          'returnRequest.reason': reason,
          'returnRequest.requestedAt': new Date(),
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedOrder) return res.status(409).json({ message: 'A return request already exists for this order' });
    res.status(201).json(updatedOrder);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Unable to submit this return request' });
  }
};

// PATCH /api/admin/orders/:id/return -- approve/reject a return or record a COD refund.
exports.reviewOrderReturn = async (req, res) => {
  const { decision } = req.body;
  const adminNote = typeof req.body.adminNote === 'string' ? req.body.adminNote.trim() : '';
  const refundReference = typeof req.body.refundReference === 'string' ? req.body.refundReference.trim() : '';
  if (adminNote.length > 500 || refundReference.length > 120) {
    return res.status(400).json({ message: 'Return review details are too long' });
  }

  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const returnStatus = order.returnRequest?.status || 'Not Requested';

    if (decision === 'reject') {
      if (returnStatus !== 'Requested') return res.status(409).json({ message: 'This return request has already been reviewed' });
      const updatedOrder = await Order.findOneAndUpdate(
        { _id: order._id, 'returnRequest.status': 'Requested' },
        { $set: { 'returnRequest.status': 'Rejected', 'returnRequest.reviewedAt': new Date(), 'returnRequest.adminNote': adminNote } },
        { new: true, runValidators: true }
      );
      if (!updatedOrder) return res.status(409).json({ message: 'This return request was updated by another administrator' });
      return res.json(updatedOrder);
    }

    if (decision === 'mark-refunded') {
      if (order.paymentMethod === 'Razorpay' || returnStatus !== 'Approved'
        || order.returnRequest?.pickupStatus !== 'Received'
        || order.returnRequest?.inspectionStatus !== 'Accepted'
        || order.paymentStatus !== 'Paid') {
        return res.status(409).json({ message: 'Only inspected, approved offline returns can be marked refunded' });
      }
      if (!refundReference) return res.status(400).json({ message: 'Enter the offline refund reference' });
      const updatedOrder = await Order.findOneAndUpdate(
        { _id: order._id, paymentMethod: mongoose.trusted({ $ne: 'Razorpay' }), 'returnRequest.status': 'Approved' },
        {
          $set: {
            paymentStatus: 'Refunded',
            refundStatus: 'Processed',
            'returnRequest.status': 'Refunded',
            'returnRequest.reviewedAt': new Date(),
            'returnRequest.refundReference': refundReference,
            'returnRequest.adminNote': adminNote,
          },
        },
        { new: true, runValidators: true }
      );
      if (!updatedOrder) return res.status(409).json({ message: 'This return was updated by another administrator' });
      await reverseCashback(updatedOrder);
      return res.json(updatedOrder);
    }

    if (decision === 'retry-refund') {
      if (order.paymentMethod !== 'Razorpay' || returnStatus !== 'Approved'
        || order.returnRequest?.pickupStatus !== 'Received'
        || order.returnRequest?.inspectionStatus !== 'Accepted') {
        return res.status(409).json({ message: 'Only inspected Razorpay returns can retry a refund' });
      }
      return res.json(await initiateReturnRefund(order));
    }

    if (decision !== 'approve') return res.status(400).json({ message: 'Decision must be approve, reject, mark-refunded, or retry-refund' });
    if (returnStatus !== 'Requested') return res.status(409).json({ message: 'This return request has already been reviewed' });

    const approvedOrder = await Order.findOneAndUpdate(
      { _id: order._id, 'returnRequest.status': 'Requested' },
      {
        $set: {
          'returnRequest.status': 'Approved',
          'returnRequest.reviewedAt': new Date(),
          'returnRequest.adminNote': adminNote,
        },
        $push: { 'returnRequest.events': { status: 'Approved', note: adminNote } },
      },
      { new: true, runValidators: true }
    );
    if (!approvedOrder) return res.status(409).json({ message: 'This return request was updated by another administrator' });
    res.json(approvedOrder);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Unable to update this return request' });
  }
};

const initiateReturnRefund = async (order) => {
  if (order.paymentMethod !== 'Razorpay') return order;
  if (order.paymentStatus !== 'Paid' || !order.razorpayPaymentId) {
    throw httpError(409, 'The Razorpay payment record is incomplete; verify it before refunding');
  }

  const claimedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      'returnRequest.status': 'Approved',
      'returnRequest.inspectionStatus': 'Accepted',
      'returnRequest.pickupStatus': 'Received',
    },
    {
      $set: {
        refundStatus: 'Pending',
        refundInitiatedAt: new Date(),
        'returnRequest.status': 'Refund Pending',
      },
    },
    { new: true, runValidators: true }
  );
  if (!claimedOrder) throw httpError(409, 'This return is already being refunded or was updated');

    let refund;
    try {
      refund = await razorpay.payments.refund(claimedOrder.razorpayPaymentId, {
        amount: Math.round(claimedOrder.totalAmount * 100),
        receipt: `return_${claimedOrder._id}`,
        notes: { localOrderId: claimedOrder._id.toString(), reason: claimedOrder.returnRequest.reason },
      });
  } catch (err) {
    return claimedOrder;
  }

  if (refund.status === 'failed') {
    return Order.findOneAndUpdate(
      { _id: claimedOrder._id, 'returnRequest.status': 'Refund Pending' },
      {
        $set: {
          refundStatus: 'Failed',
          razorpayRefundId: refund.id,
          'returnRequest.status': 'Approved',
        },
      },
      { new: true, runValidators: true }
    );
  }

  const refundProcessed = refund.status === 'processed';
  const updatedOrder = await Order.findOneAndUpdate(
    { _id: claimedOrder._id, 'returnRequest.status': 'Refund Pending' },
    {
      $set: {
        paymentStatus: refundProcessed ? 'Refunded' : 'Refund Pending',
        refundStatus: refundProcessed ? 'Processed' : 'Pending',
        razorpayRefundId: refund.id,
        'returnRequest.status': refundProcessed ? 'Refunded' : 'Refund Pending',
      },
    },
    { new: true, runValidators: true }
  );
  if (refundProcessed) await reverseCashback(updatedOrder);
  return updatedOrder;
};

exports.updateOrderReturnLogistics = async (req, res) => {
  const { pickupStatus, inspectionStatus } = req.body;
  const pickupCarrier = typeof req.body.pickupCarrier === 'string' ? req.body.pickupCarrier.trim() : '';
  const pickupTrackingNumber = typeof req.body.pickupTrackingNumber === 'string' ? req.body.pickupTrackingNumber.trim() : '';
  const adminNote = typeof req.body.adminNote === 'string' ? req.body.adminNote.trim() : '';
  if (pickupCarrier.length > 100 || pickupTrackingNumber.length > 120 || adminNote.length > 300) {
    return res.status(400).json({ message: 'Return logistics details are too long' });
  }

  try {
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.returnRequest?.status !== 'Approved') return res.status(409).json({ message: 'Only approved returns can be updated' });

    if (pickupStatus) {
      const transitions = {
        'Not scheduled': ['Scheduled'],
        Cancelled: ['Scheduled'],
        Scheduled: ['Picked up'],
        'Picked up': ['Received'],
        Received: [],
      };
      if (!transitions[order.returnRequest.pickupStatus]?.includes(pickupStatus)) {
        return res.status(409).json({ message: 'Invalid return pickup transition' });
      }
      let reverseShipment;
      let pickupClaimed = false;
      if (pickupStatus === 'Scheduled') {
        if (!shippingProvider.isConfigured()) return res.status(503).json({ message: 'Reverse shipping provider is not configured' });
        const claimedOrder = await Order.findOneAndUpdate(
          { _id: order._id, 'returnRequest.status': 'Approved', 'returnRequest.pickupStatus': order.returnRequest.pickupStatus },
          {
            $set: { 'returnRequest.pickupStatus': 'Creating' },
            $push: { 'returnRequest.events': { status: 'Pickup creation started', note: adminNote } },
          },
          { new: true, runValidators: true }
        );
        if (!claimedOrder) return res.status(409).json({ message: 'Return pickup was updated by another administrator' });
        pickupClaimed = true;
        try {
          reverseShipment = await shippingProvider.createShipment(claimedOrder, 'reverse');
        } catch (err) {
          await Order.updateOne(
            { _id: order._id, 'returnRequest.pickupStatus': 'Creating' },
            {
              $set: { 'returnRequest.pickupStatus': 'Creation uncertain' },
              $push: { 'returnRequest.events': { status: 'Pickup creation uncertain', note: err.message.slice(0, 300) } },
            }
          );
          throw err;
        }
      }

      const updatedOrder = await Order.findOneAndUpdate(
        {
          _id: order._id,
          'returnRequest.status': 'Approved',
          'returnRequest.pickupStatus': pickupClaimed ? 'Creating' : order.returnRequest.pickupStatus,
        },
        {
          $set: {
            'returnRequest.pickupStatus': pickupStatus,
            ...(reverseShipment ? {
              'returnRequest.pickupCarrier': reverseShipment.provider,
              'returnRequest.pickupTrackingNumber': reverseShipment.trackingNumber,
              'returnRequest.pickupProvider': reverseShipment.provider,
              'returnRequest.pickupShipmentId': reverseShipment.providerShipmentId,
            } : {}),
            ...(pickupStatus === 'Received' ? { 'returnRequest.inspectionStatus': 'Pending' } : {}),
          },
          $push: {
            'returnRequest.events': {
              status: pickupStatus,
              note: adminNote || reverseShipment?.status,
            },
          },
        },
        { new: true, runValidators: true }
      );
      if (!updatedOrder) return res.status(409).json({ message: 'Return pickup was updated by another administrator' });
      return res.json(updatedOrder);
    }

    if (!['Accepted', 'Rejected'].includes(inspectionStatus) || order.returnRequest.pickupStatus !== 'Received'
      || order.returnRequest.inspectionStatus !== 'Pending') {
      return res.status(409).json({ message: 'Inspection can be recorded only after the return is received' });
    }

    const inspectionOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        'returnRequest.status': 'Approved',
        'returnRequest.pickupStatus': 'Received',
        'returnRequest.inspectionStatus': 'Pending',
      },
      {
        $set: {
          'returnRequest.inspectionStatus': inspectionStatus,
          ...(inspectionStatus === 'Rejected' ? { 'returnRequest.status': 'Rejected' } : {}),
          'returnRequest.adminNote': adminNote,
        },
        $push: { 'returnRequest.events': { status: `Inspection ${inspectionStatus.toLowerCase()}`, note: adminNote } },
      },
      { new: true, runValidators: true }
    );
    if (!inspectionOrder) return res.status(409).json({ message: 'Return inspection was updated by another administrator' });
    const updatedOrder = inspectionStatus === 'Accepted' ? await initiateReturnRefund(inspectionOrder) : inspectionOrder;
    res.json(updatedOrder);
  } catch (err) {
    res.status(err.status || errorStatus(err)).json({ message: err.status ? err.message : 'Unable to update return logistics' });
  }
};

exports.cancelReturnPickup = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const returnRequest = order.returnRequest;
    if (returnRequest?.status !== 'Approved' || returnRequest.pickupStatus !== 'Scheduled'
      || !returnRequest.pickupTrackingNumber || !returnRequest.pickupProvider) {
      return res.status(409).json({ message: 'Only a scheduled reverse pickup can be cancelled' });
    }
    const shipment = await shippingProvider.cancelShipment(order, {
      provider: returnRequest.pickupProvider,
      providerShipmentId: returnRequest.pickupShipmentId,
      trackingNumber: returnRequest.pickupTrackingNumber,
      status: 'Pickup scheduled',
      events: [],
    }, 'reverse');
    returnRequest.pickupStatus = 'Cancelled';
    returnRequest.events.push({ status: 'Pickup cancelled', note: shipment.status });
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(err.status || errorStatus(err)).json({ message: err.status ? err.message : 'Unable to cancel the reverse pickup' });
  }
};

exports.reconcileUncertainShipment = async (req, res) => {
  const trackingNumber = typeof req.body.trackingNumber === 'string' ? req.body.trackingNumber.trim() : '';
  const providerShipmentId = typeof req.body.providerShipmentId === 'string' ? req.body.providerShipmentId.trim() : '';
  const sellerId = typeof req.body.sellerId === 'string' ? req.body.sellerId : '';
  if (!trackingNumber || trackingNumber.length > 120 || providerShipmentId.length > 160) {
    return res.status(400).json({ message: 'Enter the carrier tracking number and a valid shipment reference' });
  }
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const uncertain = order.sellerShipments.filter((fulfillment) =>
      ['Creating', 'Creation uncertain'].includes(fulfillment.shipmentStatus)
      && (!sellerId || String(fulfillment.seller) === sellerId));
    if (uncertain.length !== 1) return res.status(409).json({ message: 'Select exactly one uncertain seller shipment to reconcile' });
    const fulfillment = uncertain[0];
    fulfillment.status = 'Shipped';
    fulfillment.provider = shippingProvider.providerName();
    fulfillment.carrier = fulfillment.provider === 'mock' ? 'Mock Delhivery' : 'Delhivery';
    fulfillment.providerShipmentId = providerShipmentId;
    fulfillment.trackingNumber = trackingNumber;
    fulfillment.shipmentStatus = 'Shipment reconciled';
    fulfillment.shippedAt = new Date();
    fulfillment.events.push({ status: 'Shipment reconciled', description: 'Administrator confirmed the carrier shipment' });
    fulfillment.history.push({ provider: fulfillment.provider, shipmentId: providerShipmentId, trackingNumber, status: fulfillment.shipmentStatus });
    order.status = deriveOrderStatus(order);
    if (order.sellerShipments.length === 1) {
      order.shippingProvider = fulfillment.provider;
      order.shippingCarrier = fulfillment.carrier;
      order.shippingShipmentId = fulfillment.providerShipmentId;
      order.trackingNumber = fulfillment.trackingNumber;
      order.shipmentStatus = fulfillment.shipmentStatus;
      order.shipmentEvents = fulfillment.events;
      order.shippedAt = fulfillment.shippedAt;
    }
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to reconcile shipment' });
  }
};

exports.reconcileUncertainReturnPickup = async (req, res) => {
  const trackingNumber = typeof req.body.trackingNumber === 'string' ? req.body.trackingNumber.trim() : '';
  const providerShipmentId = typeof req.body.providerShipmentId === 'string' ? req.body.providerShipmentId.trim() : '';
  if (!trackingNumber || trackingNumber.length > 120 || providerShipmentId.length > 160) {
    return res.status(400).json({ message: 'Enter the carrier tracking number and a valid pickup reference' });
  }
  try {
    const order = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        'returnRequest.status': 'Approved',
        'returnRequest.pickupStatus': mongoose.trusted({ $in: ['Creating', 'Creation uncertain'] }),
      },
      {
        $set: {
          'returnRequest.pickupStatus': 'Scheduled',
          'returnRequest.pickupCarrier': shippingProvider.providerName() === 'mock' ? 'Mock Delhivery' : 'Delhivery',
          'returnRequest.pickupTrackingNumber': trackingNumber,
          'returnRequest.pickupProvider': shippingProvider.providerName(),
          'returnRequest.pickupShipmentId': providerShipmentId,
        },
        $push: { 'returnRequest.events': { status: 'Pickup reconciled', note: 'Administrator confirmed the carrier pickup' } },
      },
      { new: true, runValidators: true }
    );
    if (!order) return res.status(409).json({ message: 'This return has no uncertain pickup to reconcile' });
    res.json(order);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to reconcile reverse pickup' });
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
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('sellerShipments.seller', 'name email');
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

// GET /api/orders/seller -- orders that include products sold by the current seller
exports.getSellerOrders = async (req, res) => {
  try {
    const sellerProducts = await Product.find({ seller: req.user._id }).select('_id name');
    const productIds = sellerProducts.map((product) => product._id);

    if (!productIds.length) {
      return res.json([]);
    }

    const orders = await Order.find({ items: { $elemMatch: { product: { $in: productIds } } } })
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const sellerOrders = orders.map((order) => {
      const sellerItems = (order.items || []).filter((item) => item && item.product && productIds.some((id) => id.toString() === String(item.product)));
      return {
        ...order,
        sellerItems,
        sellerFulfillment: (order.sellerShipments || []).find((shipment) => String(shipment.seller) === String(req.user._id)) || null,
        itemCount: sellerItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        sellerRevenue: sellerItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
      };
    });

    res.json(sellerOrders);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to fetch seller orders' });
  }
};

// PATCH /api/orders/seller/:id/status -- seller updates fulfillment of their own order items
exports.updateSellerOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Processing'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Sellers may mark an order as processing; dispatch and delivery must use the verified package workflow' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = await getSellerOwnedOrder(req.params.id, req.user._id);
    if (!order) return res.status(404).json({ message: 'Order not found for this seller' });
    const fulfillment = ensureSellerFulfillment(order, req.user._id, order.$locals.sellerItems);
    const allowed = { Pending: ['Processing'], Processing: [], Shipped: [], Delivered: [] };
    if (!allowed[fulfillment.status]?.includes(status)) {
      return res.status(409).json({ message: `Cannot change seller fulfillment from ${fulfillment.status} to ${status}` });
    }
    fulfillment.status = status;
    if (status === 'Delivered') fulfillment.deliveredAt = new Date();
    order.status = deriveOrderStatus(order);
    if (order.status === 'Delivered') order.deliveredAt = order.deliveredAt || new Date();
    await order.save();
    if (order.status === 'Delivered') await creditCashback(order);
    res.json(order);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to update seller order status' });
  }
};

const getSellerOwnedOrder = async (orderId, sellerId) => {
  const sellerProducts = await Product.find({ seller: sellerId }).select('_id');
  const productIds = new Set(sellerProducts.map((product) => String(product._id)));
  const order = await Order.findById(orderId).populate('user', 'name email');
  if (!order) return null;
  const sellerItems = (order.items || []).filter((item) => item.seller
    ? String(item.seller) === String(sellerId)
    : productIds.has(String(item.product)));
  if (!sellerItems.length) return null;
  order.$locals.sellerItems = sellerItems;
  return order;
};

const ensureSellerFulfillment = (order, sellerId, sellerItems) => {
  let fulfillment = order.sellerShipments.find((shipment) => String(shipment.seller) === String(sellerId));
  if (!fulfillment) {
    const legacyStatus = ['Processing', 'Shipped', 'Delivered'].includes(order.status) ? order.status : 'Pending';
    fulfillment = order.sellerShipments.create({
      seller: sellerId,
      items: sellerItems.map((item) => ({
        product: item.product,
        name: item.name,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      status: legacyStatus,
      ...(legacyStatus === 'Shipped' && order.trackingNumber ? {
        provider: order.shippingProvider || 'manual',
        providerShipmentId: order.shippingShipmentId,
        carrier: order.shippingCarrier,
        trackingNumber: order.trackingNumber,
        shipmentStatus: order.shipmentStatus || 'Shipped',
        shippedAt: order.shippedAt,
        events: order.shipmentEvents || [],
      } : {}),
    });
  }
  return fulfillment;
};

const deriveOrderStatus = (order) => {
  const fulfillments = order.sellerShipments || [];
  if (!fulfillments.length) return order.status;
  const active = fulfillments.filter((fulfillment) => fulfillment.status !== 'Cancelled');
  if (!active.length) return 'Cancelled';
  if (active.every((fulfillment) => fulfillment.status === 'Delivered')) return 'Delivered';
  if (active.every((fulfillment) => ['Shipped', 'Delivered'].includes(fulfillment.status))) return 'Shipped';
  if (active.some((fulfillment) => ['Processing', 'Shipped', 'Delivered'].includes(fulfillment.status))) return 'Processing';
  return 'Pending';
};

exports.createSellerShipment = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = await getSellerOwnedOrder(req.params.id, req.user._id);
    if (!order) return res.status(404).json({ message: 'Order not found for this seller' });
    const fulfillment = ensureSellerFulfillment(order, req.user._id, order.$locals.sellerItems);
    if (fulfillment.status !== 'Processing') return res.status(409).json({ message: 'Only this seller’s processing fulfillment can be shipped' });
    const pkg = fulfillment.package
      ? await Package.findOne({ _id: fulfillment.package, seller: req.user._id })
      : null;
    if (!pkg || !['Ready for Dispatch', 'Assigned'].includes(pkg.status)) {
      return res.status(409).json({ message: 'Create a package, upload packing evidence, and mark it ready before dispatching' });
    }
    if (['Creating', 'Creation uncertain'].includes(fulfillment.shipmentStatus)) {
      return res.status(409).json({ message: 'Shipment creation is already in progress or requires carrier reconciliation' });
    }

    fulfillment.shipmentStatus = 'Creating';
    await order.save();
    let shipment;
    try {
      const sellerOrder = {
        ...order.toObject(),
        items: fulfillment.items,
        totalAmount: fulfillment.items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
      };
      shipment = await shippingProvider.createShipment(sellerOrder, 'forward');
    } catch (err) {
      fulfillment.shipmentStatus = 'Creation uncertain';
      fulfillment.events.push({ status: 'Shipment creation uncertain', description: err.message.slice(0, 300) });
      await order.save();
      throw err;
    }

    fulfillment.status = 'Shipped';
    fulfillment.provider = shipment.provider;
    fulfillment.carrier = shipment.provider === 'mock-delhivery' ? 'Mock Delhivery' : 'Delhivery';
    fulfillment.providerShipmentId = shipment.providerShipmentId;
    fulfillment.trackingNumber = shipment.trackingNumber;
    fulfillment.shipmentStatus = shipment.status;
    fulfillment.events = shipment.events.slice(-100);
    fulfillment.shippedAt = new Date();
    fulfillment.history.push({
      provider: shipment.provider,
      shipmentId: shipment.providerShipmentId,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
    });
    order.status = deriveOrderStatus(order);
    if (order.sellerShipments.length === 1) {
      order.shippingProvider = fulfillment.provider;
      order.shippingCarrier = fulfillment.carrier;
      order.shippingShipmentId = fulfillment.providerShipmentId;
      order.trackingNumber = fulfillment.trackingNumber;
      order.shipmentStatus = fulfillment.shipmentStatus;
      order.shipmentEvents = fulfillment.events;
      order.shippedAt = fulfillment.shippedAt;
    }
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(err.status || errorStatus(err)).json({ message: err.status ? err.message : 'Unable to create shipment' });
  }
};

exports.cancelOrderShipment = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = req.user.role === 'admin'
      ? await Order.findById(req.params.id)
      : await getSellerOwnedOrder(req.params.id, req.user._id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const requestedSellerId = req.user.role === 'admin' ? String(req.body.sellerId || '') : String(req.user._id);
    const fulfillment = order.sellerShipments.find((shipment) => String(shipment.seller) === requestedSellerId)
      || (order.sellerShipments.length === 1 ? order.sellerShipments[0] : null);
    if (!fulfillment || fulfillment.status !== 'Shipped' || !fulfillment.provider || !fulfillment.trackingNumber
      || /delivered|cancelled/i.test(fulfillment.shipmentStatus || '')) {
      return res.status(409).json({ message: 'This shipment cannot be cancelled' });
    }

    const shipment = await shippingProvider.cancelShipment(order, {
      provider: fulfillment.provider,
      providerShipmentId: fulfillment.providerShipmentId,
      trackingNumber: fulfillment.trackingNumber,
      status: fulfillment.shipmentStatus,
      events: fulfillment.events,
    }, 'forward', fulfillment.items);
    fulfillment.status = 'Processing';
    fulfillment.shipmentStatus = shipment.status;
    fulfillment.events = shipment.events.slice(-100);
    const activeShipment = fulfillment.history[fulfillment.history.length - 1];
    if (activeShipment) {
      activeShipment.status = shipment.status;
      activeShipment.cancelledAt = new Date();
    }
    order.status = deriveOrderStatus(order);
    if (order.sellerShipments.length === 1) {
      order.shippingProvider = fulfillment.provider;
      order.shippingCarrier = fulfillment.carrier;
      order.shippingShipmentId = fulfillment.providerShipmentId;
      order.trackingNumber = fulfillment.trackingNumber;
      order.shipmentStatus = shipment.status;
      order.shipmentEvents = fulfillment.events;
    }
    await order.save();
    res.json(order);
  } catch (err) {
    res.status(err.status || errorStatus(err)).json({ message: err.status ? err.message : 'Unable to cancel shipment' });
  }
};

exports.getOrderTracking = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('sellerShipments.seller', 'name email');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const isOwner = order.user._id.toString() === req.user._id.toString();
    const isSeller = req.user.role === 'seller'
      && order.sellerShipments.some((fulfillment) => String(fulfillment.seller?._id || fulfillment.seller) === String(req.user._id));
    if (!isOwner && !isSeller && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }
    const visibleFulfillments = isSeller
      ? order.sellerShipments.filter((fulfillment) => String(fulfillment.seller?._id || fulfillment.seller) === String(req.user._id))
      : order.sellerShipments;
    const activeFulfillments = visibleFulfillments.filter((fulfillment) => fulfillment.provider && fulfillment.trackingNumber);
    if (isSeller && !activeFulfillments.length) {
      return res.status(409).json({ message: 'No carrier shipment exists for this seller fulfillment' });
    }
    const trackingResults = [];
    if (activeFulfillments.length) {
      for (const fulfillment of activeFulfillments) {
        if (fulfillment.status === 'Cancelled') continue;
        const shipment = await shippingProvider.trackShipment(order, {
          provider: fulfillment.provider,
          providerShipmentId: fulfillment.providerShipmentId,
          trackingNumber: fulfillment.trackingNumber,
          status: fulfillment.shipmentStatus,
          events: fulfillment.events,
        }, 'forward', fulfillment.items);
        fulfillment.shipmentStatus = shipment.status;
        fulfillment.events = shipment.events.slice(-100);
        const normalizedStatus = shipment.status.toLowerCase();
        if (normalizedStatus.includes('delivered')) {
          fulfillment.status = 'Delivered';
          fulfillment.deliveredAt = fulfillment.deliveredAt || new Date();
        } else if (/(shipped|in transit|out for delivery)/i.test(normalizedStatus) && fulfillment.status === 'Processing') {
          fulfillment.status = 'Shipped';
        }
        trackingResults.push({
          fulfillmentId: String(fulfillment._id),
          seller: fulfillment.seller,
          trackingNumber: fulfillment.trackingNumber,
          carrier: fulfillment.carrier,
          provider: fulfillment.provider,
          status: fulfillment.shipmentStatus,
          events: fulfillment.events,
        });
      }
      order.status = deriveOrderStatus(order);
      if (order.status === 'Delivered') order.deliveredAt = order.deliveredAt || new Date();
    } else if (order.shippingProvider && order.trackingNumber) {
      const shipment = await shippingProvider.trackShipment(order, {
        provider: order.shippingProvider,
        providerShipmentId: order.shippingShipmentId,
        trackingNumber: order.trackingNumber,
        status: order.shipmentStatus,
        events: order.shipmentEvents,
      });
      order.shipmentStatus = shipment.status;
      order.shipmentEvents = shipment.events.slice(-100);
      if (shipment.status.toLowerCase().includes('delivered') && order.status !== 'Cancelled') {
        order.status = 'Delivered';
        order.deliveredAt = order.deliveredAt || new Date();
      }
      trackingResults.push({
        trackingNumber: order.trackingNumber,
        carrier: order.shippingCarrier,
        provider: order.shippingProvider,
        status: order.shipmentStatus,
        events: order.shipmentEvents,
      });
    } else {
      return res.status(409).json({ message: 'No carrier shipment exists for this order' });
    }
    await order.save();
    if (order.status === 'Delivered') await creditCashback(order);

    let reversePickup = null;
    if (!isSeller && ['Scheduled', 'Picked up'].includes(order.returnRequest?.pickupStatus)
      && order.returnRequest.pickupTrackingNumber) {
      try {
        reversePickup = await shippingProvider.trackShipment(order, {
          provider: order.returnRequest.pickupProvider,
          providerShipmentId: order.returnRequest.pickupShipmentId,
          trackingNumber: order.returnRequest.pickupTrackingNumber,
          status: order.returnRequest.pickupStatus,
          events: order.returnRequest.events,
        }, 'reverse');
        const reverseStatus = reversePickup.status.toLowerCase();
        const returnEvents = reversePickup.events || [];
        const knownEvents = new Set(order.returnRequest.events.map((event) => `${event.status}|${new Date(event.createdAt).getTime()}`));
        const newEvents = returnEvents.slice(-100).map((event) => ({
          status: `Pickup ${event.status}`,
          note: [event.location, event.description].filter(Boolean).join(' · ').slice(0, 300),
          createdAt: event.createdAt,
        })).filter((event) => !knownEvents.has(`${event.status}|${new Date(event.createdAt).getTime()}`));
        order.returnRequest.events.push(...newEvents);
        if (/(received|delivered|returned to origin)/i.test(reverseStatus)) {
          order.returnRequest.pickupStatus = 'Received';
          order.returnRequest.inspectionStatus = 'Pending';
        } else if (/(picked.?up|collected|in transit)/i.test(reverseStatus)) {
          order.returnRequest.pickupStatus = 'Picked up';
        }
        if (order.returnRequest.events.length > 100) {
          order.returnRequest.events.splice(0, order.returnRequest.events.length - 100);
        }
        if (newEvents.length) await order.save();
      } catch {
        reversePickup = null;
      }
    }
    res.json({
      status: order.status,
      shipments: trackingResults,
      shipment: {
        provider: order.shippingProvider,
        trackingNumber: order.trackingNumber,
        status: order.shipmentStatus,
        events: order.shipmentEvents,
      },
      reversePickup,
    });
  } catch (err) {
    res.status(err.status || errorStatus(err)).json({ message: err.status ? err.message : 'Unable to refresh shipment tracking' });
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
    const orders = await Order.find(filter)
      .populate('user', 'name email')
      .populate('sellerShipments.seller', 'name email')
      .sort({ createdAt: -1 });
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
    const sellerFulfillments = order.sellerShipments || [];
    if (status === 'Shipped' && sellerFulfillments.length
      && !sellerFulfillments.every((fulfillment) => ['Shipped', 'Delivered', 'Cancelled'].includes(fulfillment.status))) {
      return res.status(409).json({ message: 'Create a carrier shipment for every seller fulfillment before marking the order shipped' });
    }
    if (status === 'Delivered' && sellerFulfillments.length
      && (!sellerFulfillments.some((fulfillment) => fulfillment.status !== 'Cancelled')
        || sellerFulfillments.some((fulfillment) => !['Delivered', 'Cancelled'].includes(fulfillment.status)))) {
      return res.status(409).json({ message: 'Every active seller shipment must be delivered before closing the order' });
    }
    if (status === 'Cancelled' && sellerFulfillments.some((fulfillment) => fulfillment.status === 'Delivered')) {
      return res.status(409).json({ message: 'Delivered seller fulfillments must use the return workflow' });
    }
    if (status === 'Cancelled' && sellerFulfillments.some((fulfillment) => fulfillment.status === 'Shipped')) {
      return res.status(409).json({ message: 'Cancel active carrier shipments before cancelling the order' });
    }
    if (status === 'Cancelled' && order.paymentMethod === 'Razorpay' && order.paymentStatus === 'Paid') {
      return res.status(409).json({ message: 'Paid Razorpay orders must be cancelled through the refund workflow.' });
    }
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

    if (status === 'Cancelled') {
      updatedOrder.sellerShipments.forEach((fulfillment) => { fulfillment.status = 'Cancelled'; });
      await updatedOrder.save();
    }

    if (status === 'Cancelled') await releaseCouponRedemption(updatedOrder._id);
    if (status === 'Delivered') await creditCashback(updatedOrder);

    res.json(updatedOrder);
  } catch (err) {
    res.status(errorStatus(err)).json({ message: 'Failed to update order status' });
  }
};
