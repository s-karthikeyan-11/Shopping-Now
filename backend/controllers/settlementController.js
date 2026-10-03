const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const SellerProfile = require('../models/SellerProfile');
const SellerSettlement = require('../models/SellerSettlement');
const User = require('../models/User');
const { creditCashback } = require('../services/walletLedger');
const razorpayX = require('../services/razorpayX');
const { randomUUID } = require('crypto');

const excludedReturnStatuses = ['Requested', 'Approved', 'Refund Pending', 'Refunded'];

const reconcileSettlements = async (sellerUserId) => {
  const openReturnOrders = await Order.find({ status: 'Delivered', 'returnRequest.status': mongoose.trusted({ $in: ['Requested', 'Approved', 'Refund Pending'] }) }).select('_id').lean();
  if (openReturnOrders.length) {
    await SellerSettlement.updateMany(
      { order: mongoose.trusted({ $in: openReturnOrders.map((order) => order._id) }), status: 'Pending' },
      { $set: { status: 'On Hold' } }
    );
  }
  const refundedOrders = await Order.find({ status: 'Delivered', 'returnRequest.status': 'Refunded' }).select('_id').lean();
  if (refundedOrders.length) {
    await SellerSettlement.updateMany(
      { order: mongoose.trusted({ $in: refundedOrders.map((order) => order._id) }), status: mongoose.trusted({ $in: ['Pending', 'On Hold'] }) },
      { $set: { status: 'Cancelled' } }
    );
    await SellerSettlement.updateMany(
      { order: mongoose.trusted({ $in: refundedOrders.map((order) => order._id) }), status: 'Paid' },
      { $set: { status: 'Recovery Due' } }
    );
  }
  const orderFilter = {
    status: 'Delivered',
    paymentStatus: 'Paid',
    $or: [
      { 'returnRequest.status': mongoose.trusted({ $nin: excludedReturnStatuses }) },
      { 'returnRequest.status': mongoose.trusted({ $exists: false }) },
    ],
  };
  const orders = await Order.find(orderFilter).lean();
  const profiles = await SellerProfile.find(sellerUserId ? { user: sellerUserId } : {}).lean();
  const profileByUser = new Map(profiles.map((profile) => [String(profile.user), profile]));

  for (const order of orders) {
    const productIds = (order.items || []).map((item) => item.product).filter(Boolean);
    if (!productIds.length) continue;
    const products = (order.items || []).some((item) => !item.seller)
      ? await Product.find({ _id: mongoose.trusted({ $in: productIds }) }).select('_id seller').lean()
      : [];
    const sellerByProduct = new Map(products.map((product) => [String(product._id), String(product.seller)]));
    const amountsBySeller = new Map();
    const orderItemsGross = (order.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);

    for (const item of order.items || []) {
      const gross = Number(item.lineTotal || 0);
      const sellerId = item.seller ? String(item.seller) : sellerByProduct.get(String(item.product));
      if (!sellerId || (sellerUserId && sellerId !== String(sellerUserId))) continue;
      const sellerAmount = amountsBySeller.get(sellerId) || { gross: 0, discountShare: 0, commission: 0, commissionRate: Number(item.commissionRate ?? profileByUser.get(sellerId)?.commissionRate ?? 8) };
      const discountShare = orderItemsGross > 0 ? Number(order.couponDiscount || 0) * gross / orderItemsGross : 0;
      const commissionableLine = Math.max(0, gross - discountShare);
      const lineRate = Number(item.commissionRate ?? profileByUser.get(sellerId)?.commissionRate ?? 8);
      sellerAmount.gross += gross;
      sellerAmount.discountShare += discountShare;
      sellerAmount.commission += Math.round(commissionableLine * lineRate) / 100;
      amountsBySeller.set(sellerId, sellerAmount);
    }

    for (const [sellerId, sellerAmount] of amountsBySeller) {
      const profile = profileByUser.get(sellerId);
      if (!profile) continue;
      const grossAmount = Math.round(sellerAmount.gross * 100) / 100;
      const couponDiscountShare = Math.round(sellerAmount.discountShare * 100) / 100;
      const commissionRate = sellerAmount.commissionRate;
      const commissionAmount = Math.round(sellerAmount.commission * 100) / 100;
      const commissionableAmount = Math.max(0, grossAmount - couponDiscountShare);
      const netAmount = Math.max(0, Math.round((commissionableAmount - commissionAmount) * 100) / 100);
      const existing = await SellerSettlement.findOne({ seller: profile._id, order: order._id });

      if (!existing) {
        await SellerSettlement.create({
          seller: profile._id,
          order: order._id,
          grossAmount: Math.round(grossAmount * 100) / 100,
          couponDiscountShare,
          commissionRate,
          commissionAmount,
          netAmount,
          status: profile.status === 'approved' && profile.complianceStatus === 'verified' ? 'Pending' : 'On Hold',
        }).catch((err) => {
          if (err.code !== 11000) throw err;
        });
      } else if (existing.status === 'On Hold' && profile.status === 'approved' && profile.complianceStatus === 'verified') {
        await SellerSettlement.updateOne({ _id: existing._id, status: 'On Hold' }, { $set: { status: 'Pending' } });
      }
    }
  }
};

const toSummary = (settlements) => settlements.reduce((summary, settlement) => {
  if (settlement.status === 'Cancelled') return summary;
  if (settlement.status === 'Recovery Due') {
    summary.recoveryDue += Number(settlement.netAmount || 0);
    return summary;
  }
  if (settlement.status === 'Recovered') return summary;
  const key = {
    Paid: 'paidAmount',
    Pending: 'pendingAmount',
    Processing: 'processingAmount',
    Failed: 'failedAmount',
    'On Hold': 'onHoldAmount',
  }[settlement.status] || 'onHoldAmount';
  summary[key] += Number(settlement.netAmount || 0);
  return summary;
}, { pendingAmount: 0, processingAmount: 0, failedAmount: 0, paidAmount: 0, onHoldAmount: 0, recoveryDue: 0 });

exports.getSellerSettlements = async (req, res) => {
  try {
    const profile = await SellerProfile.findOne({ user: req.user._id }).select('_id').lean();
    if (!profile) return res.json({ summary: toSummary([]), settlements: [] });
    await reconcileSettlements(req.user._id);
    const settlements = await SellerSettlement.find({ seller: profile._id })
      .populate('order', '_id createdAt')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ summary: toSummary(settlements), settlements });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load seller settlements' });
  }
};

exports.getAdminSettlements = async (req, res) => {
  try {
    await reconcileSettlements();
    const [settlements, codOrders] = await Promise.all([
      SellerSettlement.find().populate({ path: 'seller', select: 'businessName user', populate: { path: 'user', select: 'name email' } }).populate('order', '_id createdAt paymentMethod').sort({ createdAt: -1 }).limit(300).lean(),
      Order.find({ status: 'Delivered', paymentMethod: 'Cash on Delivery', paymentStatus: 'Pending' }).populate('user', 'name email').sort({ deliveredAt: 1 }).lean(),
    ]);
    res.json({ summary: toSummary(settlements), settlements, codOrders, payoutProviderConfigured: razorpayX.isConfigured() });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load marketplace settlements' });
  }
};

exports.markCashCollected = async (req, res) => {
  const reference = typeof req.body.reference === 'string' ? req.body.reference.trim() : '';
  if (!reference || reference.length > 120) return res.status(400).json({ message: 'Enter a valid cash collection reference' });
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Invalid order ID' });
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: 'Delivered', paymentMethod: 'Cash on Delivery', paymentStatus: 'Pending' },
      { $set: { paymentStatus: 'Paid', paymentCollectedAt: new Date(), paymentCollectionReference: reference, paymentCollectedBy: req.user._id } },
      { new: true, runValidators: true }
    );
    if (!order) return res.status(409).json({ message: 'This COD order is not awaiting collection confirmation' });
    await creditCashback(order);
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to record cash collection' });
  }
};

exports.markSettlementPaid = async (req, res) => {
  if (razorpayX.isConfigured()) {
    try {
      const settlement = await SellerSettlement.findById(req.params.id)
        .select('+payoutIdempotencyKey')
        .populate('seller', 'user status complianceStatus payoutAccount');
      if (!settlement) return res.status(404).json({ message: 'Settlement not found' });
      if (!['Pending', 'Failed', 'Processing'].includes(settlement.status)) {
        return res.status(409).json({ message: 'This settlement is not eligible for a RazorpayX payout' });
      }
      const profile = await SellerProfile.findById(settlement.seller._id)
        .select('+razorpayXContactId +razorpayXFundAccountId +payoutAccountEncrypted');
      if (!profile || profile.status !== 'approved' || profile.complianceStatus !== 'verified') {
        return res.status(409).json({ message: 'Seller approval and payout compliance are required' });
      }
      const user = await User.findById(profile.user).select('name email');
      if (!user) return res.status(409).json({ message: 'Seller user record not found' });

      const idempotencyKey = settlement.status === 'Processing' && settlement.payoutIdempotencyKey
        ? settlement.payoutIdempotencyKey
        : randomUUID();
      if (settlement.status !== 'Processing') {
        const claimed = await SellerSettlement.findOneAndUpdate(
          { _id: settlement._id, status: settlement.status },
          { $set: { status: 'Processing', payoutIdempotencyKey: idempotencyKey, payoutError: '' } },
          { new: true, runValidators: true }
        );
        if (!claimed) return res.status(409).json({ message: 'This settlement was updated by another administrator' });
      }

      try {
        const payout = await razorpayX.sendSellerPayout({ profile, user, settlement, idempotencyKey });
        const isPaid = payout.status === 'processed';
        const isFailed = ['failed', 'reversed', 'cancelled', 'rejected'].includes(payout.status);
        const updatedSettlement = await SellerSettlement.findOneAndUpdate(
          { _id: settlement._id, status: 'Processing', payoutIdempotencyKey: idempotencyKey },
          {
            $set: {
              status: isPaid ? 'Paid' : isFailed ? 'Failed' : 'Processing',
              razorpayPayoutId: payout.id,
              payoutReference: payout.utr || payout.id,
              ...(isPaid ? { paidAt: new Date(), paidBy: req.user._id } : {}),
            },
          },
          { new: true, runValidators: true }
        );
        return res.json(updatedSettlement || settlement);
      } catch (err) {
        const isProviderResponse = Number.isInteger(err.status);
        const updatedSettlement = await SellerSettlement.findOneAndUpdate(
          { _id: settlement._id, status: 'Processing', payoutIdempotencyKey: idempotencyKey },
          { $set: { status: isProviderResponse ? 'Failed' : 'Processing', payoutError: err.message.slice(0, 500) } },
          { new: true, runValidators: true }
        );
        return res.status(isProviderResponse ? 502 : 202).json({
          message: isProviderResponse ? 'RazorpayX rejected the payout' : 'Payout status is uncertain; retry safely using the same idempotency key',
          settlement: updatedSettlement,
        });
      }
    } catch (err) {
      return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to initiate RazorpayX payout' });
    }
  }
  if (process.env.NODE_ENV === 'production') {
    return res.status(503).json({ message: 'Configure RazorpayX to send seller payouts in production' });
  }

  const reference = typeof req.body.reference === 'string' ? req.body.reference.trim() : '';
  if (!reference || reference.length > 120) return res.status(400).json({ message: 'Enter a valid payout reference' });
  try {
    const settlement = await SellerSettlement.findOneAndUpdate(
      { _id: req.params.id, status: 'Pending' },
      { $set: { status: 'Paid', payoutReference: reference, paidAt: new Date(), paidBy: req.user._id } },
      { new: true, runValidators: true }
    );
    if (!settlement) return res.status(409).json({ message: 'This payout is not currently eligible' });
    res.json(settlement);
  } catch (err) {
    res.status(500).json({ message: 'Failed to record seller payout' });
  }
};

exports.refreshRazorpayXPayout = async (req, res) => {
  if (!razorpayX.isConfigured()) return res.status(503).json({ message: 'RazorpayX is not configured' });
  try {
    const settlement = await SellerSettlement.findById(req.params.id);
    if (!settlement?.razorpayPayoutId) return res.status(404).json({ message: 'No RazorpayX payout exists for this settlement' });
    const payout = await razorpayX.fetchPayout(settlement.razorpayPayoutId);
    const status = payout.status === 'processed'
      ? 'Paid'
      : ['failed', 'reversed', 'cancelled', 'rejected'].includes(payout.status) ? 'Failed' : 'Processing';
    const updated = await SellerSettlement.findByIdAndUpdate(
      settlement._id,
      {
        $set: {
          status,
          payoutReference: payout.utr || payout.id,
          payoutError: status === 'Failed' ? (payout.status_details?.description || payout.status).slice(0, 500) : '',
          ...(status === 'Paid' ? { paidAt: settlement.paidAt || new Date() } : {}),
        },
      },
      { new: true, runValidators: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(err.status || 502).json({ message: err.status ? err.message : 'Could not fetch RazorpayX payout status' });
  }
};

exports.markSettlementRecovered = async (req, res) => {
  const reference = typeof req.body.reference === 'string' ? req.body.reference.trim() : '';
  if (!reference || reference.length > 120) return res.status(400).json({ message: 'Enter a valid recovery reference' });
  try {
    const settlement = await SellerSettlement.findOneAndUpdate(
      { _id: req.params.id, status: 'Recovery Due' },
      { $set: { status: 'Recovered', recoveryReference: reference, recoveredAt: new Date(), recoveredBy: req.user._id } },
      { new: true, runValidators: true }
    );
    if (!settlement) return res.status(409).json({ message: 'This settlement has no outstanding recovery' });
    res.json(settlement);
  } catch (err) {
    res.status(500).json({ message: 'Failed to record seller recovery' });
  }
};