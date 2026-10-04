const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerShipmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    packageId: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    qrTokenHash: { type: String, required: true, select: false },
    qrTokenEncrypted: { type: String, required: true, select: false },
    deliveryPinHash: { type: String, required: true, select: false },
    deliveryPinEncrypted: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ['Created', 'Packing', 'Ready for Dispatch', 'Assigned', 'Scanned', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Failed Delivery', 'Cancelled'],
      default: 'Created',
      index: true,
    },
    assignedDeliveryPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryPartnerProfile', default: null, index: true },
    scannedAt: { type: Date },
    pickedUpAt: { type: Date },
    outForDeliveryAt: { type: Date },
    deliveredAt: { type: Date },
    failedDeliveryReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

packageSchema.index({ order: 1, seller: 1 }, { unique: true });
packageSchema.index({ assignedDeliveryPartner: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Package', packageSchema);
