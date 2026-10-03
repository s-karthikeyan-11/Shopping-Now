const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
      match: /^[A-Z0-9_-]+$/,
    },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: 0.01 },
    maxDiscount: { type: Number, min: 0.01 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    maxRedemptions: { type: Number, min: 1 },
    perUserLimit: { type: Number, min: 1 },
    redemptionCount: { type: Number, default: 0, min: 0 },
    cashbackPercent: { type: Number, default: 0, min: 0, max: 100 },
    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);