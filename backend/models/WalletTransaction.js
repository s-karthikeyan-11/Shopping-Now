const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    type: { type: String, enum: ['cashback', 'cashback_reversal'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    couponCode: { type: String, trim: true, uppercase: true },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ order: 1, type: 1 }, { unique: true });
walletTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);