const mongoose = require('mongoose');

const deliveryPartnerProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    contactNumber: { type: String, required: true, trim: true, maxlength: 30 },
    vehicleType: { type: String, trim: true, maxlength: 60, default: '' },
    vehicleNumber: { type: String, trim: true, uppercase: true, maxlength: 30, default: '' },
    serviceAreas: [{ type: String, trim: true, maxlength: 80 }],
    identityDocumentUrl: { type: String, trim: true, maxlength: 2048, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

deliveryPartnerProfileSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('DeliveryPartnerProfile', deliveryPartnerProfileSchema);
