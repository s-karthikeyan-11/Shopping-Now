const Order = require('../models/Order');
const WalletTransaction = require('../models/WalletTransaction');
const mongoose = require('mongoose');
const { creditCashback, reverseCashback } = require('../services/walletLedger');

exports.getMyWallet = async (req, res) => {
  try {
    const eligibleOrders = await Order.find({
      user: req.user._id,
      status: 'Delivered',
      paymentStatus: 'Paid',
      cashbackAmount: mongoose.trusted({ $gt: 0 }),
    }).select('_id cashbackAmount couponCode').lean();

    for (const order of eligibleOrders) {
      await creditCashback({ ...order, user: req.user._id });
    }

    const refundedOrders = await Order.find({
      user: req.user._id,
      status: 'Delivered',
      paymentStatus: 'Refunded',
      cashbackAmount: mongoose.trusted({ $gt: 0 }),
    }).select('_id couponCode').lean();
    for (const order of refundedOrders) {
      await reverseCashback({ ...order, user: req.user._id });
    }

    const [summary] = await WalletTransaction.aggregate([
      { $match: { user: req.user._id } },
      { $group: { _id: null, balance: { $sum: { $cond: [{ $eq: ['$type', 'cashback'] }, '$amount', { $multiply: ['$amount', -1] }] } } } },
    ]);
    const transactions = await WalletTransaction.find({ user: req.user._id })
      .populate('order', '_id createdAt')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ balance: Number((summary?.balance || 0).toFixed(2)), transactions });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load your cashback wallet' });
  }
};