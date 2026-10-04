const mongoose = require('mongoose');

const disputeSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: {
      type: String,
      enum: ['Damaged item', 'Incorrect item', 'Missing item', 'Tampered package', 'Other'],
      required: true,
    },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    evidence: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Evidence' }],
    status: { type: String, enum: ['Open', 'Seller Responded', 'Under Review', 'Resolved - Approved', 'Resolved - Rejected'], default: 'Open', index: true },
    sellerResponse: { text: { type: String, trim: true, maxlength: 2000 }, respondedAt: Date },
    adminDecision: {
      decision: { type: String, enum: ['approve', 'reject'] },
      note: { type: String, trim: true, maxlength: 2000 },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      decidedAt: Date,
    },
  },
  { timestamps: true }
);

disputeSchema.index({ order: 1, package: 1, status: 1 });
disputeSchema.index({ customer: 1, createdAt: -1 });
disputeSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.model('Dispute', disputeSchema);
