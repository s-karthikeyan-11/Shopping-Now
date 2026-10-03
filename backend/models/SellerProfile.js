const mongoose = require('mongoose');

const sellerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    contactNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    gstNumber: {
      type: String,
      trim: true,
      maxlength: 32,
      default: '',
    },
    businessAddress: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    payoutAccount: {
      bankName: { type: String, default: '' },
      accountHolderName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
    },
    payoutAccountEncrypted: { type: String, select: false },
    razorpayXContactId: { type: String, select: false },
    razorpayXFundAccountId: { type: String, select: false },
    verificationDocuments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected'],
          default: 'pending',
        },
        reviewNote: { type: String, trim: true, maxlength: 500, default: '' },
        reviewedAt: { type: Date },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    complianceStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
    complianceNote: { type: String, trim: true, maxlength: 500, default: '' },
    commissionRate: {
      type: Number,
      default: 8,
      min: 0,
      max: 100,
    },
    rejectionReason: {
      type: String,
      default: '',
      maxlength: 500,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SellerProfile', sellerProfileSchema);
