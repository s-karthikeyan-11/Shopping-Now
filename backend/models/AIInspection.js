const mongoose = require('mongoose');

const aiInspectionSchema = new mongoose.Schema(
  {
    dispute: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute', unique: true, sparse: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true, index: true },
    status: { type: String, enum: ['unavailable', 'completed', 'failed'], required: true },
    provider: { type: String, enum: ['baseline', 'remote'], required: true },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    summary: { type: String, trim: true, maxlength: 2000, default: '' },
    limitations: [{ type: String, trim: true, maxlength: 500 }],
    result: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AIInspection', aiInspectionSchema);
