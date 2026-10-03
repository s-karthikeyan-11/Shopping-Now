const mongoose = require('mongoose');

const sellerSettlementSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerProfile', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    grossAmount: { type: Number, required: true, min: 0 },
    couponDiscountShare: { type: Number, required: true, min: 0, default: 0 },
    commissionRate: { type: Number, required: true, min: 0, max: 100 },
    commissionAmount: { type: Number, required: true, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['On Hold', 'Pending', 'Processing', 'Failed', 'Paid', 'Recovery Due', 'Recovered', 'Cancelled'], default: 'On Hold' },
    payoutReference: { type: String, trim: true, maxlength: 120 },
    razorpayPayoutId: { type: String, unique: true, sparse: true },
    payoutIdempotencyKey: { type: String, select: false },
    payoutError: { type: String, trim: true, maxlength: 500 },
    paidAt: { type: Date },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recoveryReference: { type: String, trim: true, maxlength: 120 },
    recoveredAt: { type: Date },
    recoveredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

sellerSettlementSchema.index({ seller: 1, order: 1 }, { unique: true });
sellerSettlementSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SellerSettlement', sellerSettlementSchema);