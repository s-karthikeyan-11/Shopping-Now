const WalletTransaction = require('../models/WalletTransaction');

exports.creditCashback = async (order) => {
  if (!order || !order.user || !order._id || order.status !== 'Delivered' || order.paymentStatus !== 'Paid' || Number(order.cashbackAmount) <= 0) return;
  try {
    await WalletTransaction.updateOne(
      { order: order._id, type: 'cashback' },
      {
        $setOnInsert: {
          user: order.user,
          order: order._id,
          type: 'cashback',
          amount: order.cashbackAmount,
          couponCode: order.couponCode,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
};

exports.reverseCashback = async (order) => {
  if (!order || !order.user || !order._id) return;
  const credit = await WalletTransaction.findOne({ order: order._id, type: 'cashback' }).lean();
  if (!credit) return;
  try {
    await WalletTransaction.updateOne(
      { order: order._id, type: 'cashback_reversal' },
      {
        $setOnInsert: {
          user: order.user,
          order: order._id,
          type: 'cashback_reversal',
          amount: credit.amount,
          couponCode: order.couponCode,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
};