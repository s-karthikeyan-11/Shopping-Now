const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true, index: true },
    type: { type: String, enum: ['packing', 'unboxing', 'delivery_proof'], required: true, index: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    submittedRole: { type: String, enum: ['user', 'seller', 'delivery', 'admin'], required: true },
    originalFilename: { type: String, required: true, trim: true, maxlength: 180 },
    mimeType: { type: String, required: true, trim: true, maxlength: 100 },
    bytes: { type: Number, required: true, min: 1 },
    sha256: { type: String, required: true, lowercase: true, match: /^[a-f0-9]{64}$/ },
    storage: {
      provider: { type: String, enum: ['cloudinary'], required: true },
      publicId: { type: String, required: true, trim: true, maxlength: 300 },
      secureUrl: { type: String, required: true, select: false },
      resourceType: { type: String, enum: ['image', 'video', 'raw'], required: true },
    },
    status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
  },
  { timestamps: true }
);

evidenceSchema.index({ package: 1, type: 1, createdAt: -1 });
evidenceSchema.index({ order: 1, submittedBy: 1, sha256: 1 });

module.exports = mongoose.model('Evidence', evidenceSchema);
