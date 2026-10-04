const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const SellerSettlement = require('../models/SellerSettlement');
const { reverseCashback } = require('../services/walletLedger');

const signaturesMatch = (rawBody, signature, secret) => {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

exports.handleRazorpayWebhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ message: 'Razorpay webhook secret is not configured' });
  if (!signaturesMatch(req.rawBody, req.get('x-razorpay-signature'), secret)) {
    return res.status(401).json({ message: 'Invalid webhook signature' });
  }

  const event = req.body.event;
  if (event === 'payment.captured') {
    const payment = req.body.payload?.payment?.entity;
    if (!payment?.id || !payment?.order_id || payment.status !== 'captured') {
      return res.status(400).json({ message: 'Captured payment event is incomplete' });
    }
    try {
      const order = await Order.findOne({ razorpayOrderId: payment.order_id, paymentMethod: 'Razorpay' });
      if (!order) return res.json({ received: true });
      const expectedAmount = Math.round(Number(order.totalAmount || 0) * 100);
      if (payment.currency !== 'INR' || Number(payment.amount) !== expectedAmount) {
        console.error(`Razorpay payment amount mismatch for local order ${order._id}`);
        return res.json({ received: true });
      }
      // Compare-and-set makes browser verification and webhook reconciliation
      // safe to run in either order without double-processing the payment.
      await Order.findOneAndUpdate(
        {
          _id: order._id,
          status: 'Awaiting Payment',
          paymentStatus: 'Pending',
          razorpayOrderId: payment.order_id,
        },
        {
          $set: {
            status: 'Pending',
            paymentStatus: 'Paid',
            razorpayPaymentId: payment.id,
            paidAt: new Date(),
            ...(order.coupon ? { couponRedemptionStatus: 'Redeemed' } : {}),
          },
        },
        { new: true, runValidators: true }
      );
      return res.json({ received: true });
    } catch (err) {
      if (err?.code === 11000) return res.json({ received: true });
      return res.status(500).json({ message: 'Failed to reconcile captured payment' });
    }
  }
  if (!['refund.processed', 'refund.failed'].includes(event)) return res.json({ received: true });
  const refund = req.body.payload?.refund?.entity;
  if (!refund?.id) return res.status(400).json({ message: 'Refund event is missing its refund ID' });

  try {
    const order = await Order.findOne({ razorpayRefundId: refund.id });
    if (!order || order.refundStatus !== 'Pending') return res.json({ received: true });

    const processed = event === 'refund.processed';
    const returnIsPending = order.returnRequest?.status === 'Refund Pending';
    const updates = {
      refundStatus: processed ? 'Processed' : 'Failed',
      paymentStatus: processed ? 'Refunded' : 'Paid',
      ...(returnIsPending ? { 'returnRequest.status': processed ? 'Refunded' : 'Approved' } : {}),
    };
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: order._id, refundStatus: 'Pending', razorpayRefundId: refund.id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (processed) await reverseCashback(updatedOrder);
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reconcile refund event' });
  }
};

exports.handleRazorpayXPayoutWebhook = async (req, res) => {
  const secret = process.env.RAZORPAYX_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ message: 'RazorpayX webhook secret is not configured' });
  if (!signaturesMatch(req.rawBody, req.get('x-razorpay-signature'), secret)) {
    return res.status(401).json({ message: 'Invalid webhook signature' });
  }

  const event = req.body.event;
  const payout = req.body.payload?.payout?.entity;
  if (!payout?.id) return res.status(400).json({ message: 'Payout event is missing its payout ID' });
  const statusByEvent = {
    'payout.pending': 'Processing',
    'payout.queued': 'Processing',
    'payout.initiated': 'Processing',
    'payout.updated': 'Processing',
    'payout.processed': 'Paid',
    'payout.failed': 'Failed',
    'payout.reversed': 'Failed',
    'payout.cancelled': 'Failed',
    'payout.rejected': 'Failed',
  };
  const statusByProviderState = {
    processed: 'Paid',
    failed: 'Failed',
    reversed: 'Failed',
    cancelled: 'Failed',
    rejected: 'Failed',
    pending: 'Processing',
    queued: 'Processing',
    processing: 'Processing',
  };
  const settlementStatus = statusByProviderState[payout.status] || statusByEvent[event];
  if (!settlementStatus) return res.json({ received: true });

  try {
    let settlement = await SellerSettlement.findOne({ razorpayPayoutId: payout.id });
    if (!settlement && mongoose.Types.ObjectId.isValid(payout.reference_id)) {
      settlement = await SellerSettlement.findById(payout.reference_id);
    }
    if (!settlement) return res.json({ received: true });
    if (settlement.razorpayPayoutId && settlement.razorpayPayoutId !== payout.id) return res.json({ received: true });
    if (settlement.status === 'Paid' && settlementStatus !== 'Paid' && event !== 'payout.reversed') {
      return res.json({ received: true });
    }
    if (['Failed', 'Cancelled', 'Recovered'].includes(settlement.status) && settlementStatus === 'Processing') {
      return res.json({ received: true });
    }
    const updated = await SellerSettlement.findOneAndUpdate(
      { _id: settlement._id, status: mongoose.trusted({ $in: ['Processing', 'Paid', 'Failed'] }) },
      {
        $set: {
          status: settlementStatus,
          razorpayPayoutId: payout.id,
          payoutReference: payout.utr || payout.id,
          payoutError: settlementStatus === 'Failed' ? (payout.status_details?.description || event).slice(0, 500) : '',
          ...(settlementStatus === 'Paid' ? { paidAt: settlement.paidAt || new Date() } : {}),
        },
      },
      { new: true, runValidators: true }
    );
    res.json({ received: true, updated: Boolean(updated) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reconcile RazorpayX payout event' });
  }
};
