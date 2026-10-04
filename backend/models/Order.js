const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    commissionRate: { type: Number, min: 0, max: 100, default: 8 },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true }, // base price at time of order
    discountPercent: { type: Number, required: true, default: 0 },
    gstPercent: { type: Number, required: true, default: 0 },
    finalPrice: { type: Number, required: true }, // per-unit final price at order time
    lineTotal: { type: Number, required: true }, // finalPrice * quantity
  },
  { _id: false }
);

const sellerShipmentSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', default: null },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  }],
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Pending',
  },
  provider: { type: String, trim: true, maxlength: 40 },
  providerShipmentId: { type: String, trim: true, maxlength: 160 },
  carrier: { type: String, trim: true, maxlength: 100 },
  trackingNumber: { type: String, trim: true, maxlength: 120 },
  shipmentStatus: { type: String, trim: true, maxlength: 100 },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },
  events: [{
    status: { type: String, required: true },
    location: { type: String, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 300 },
    createdAt: { type: Date, default: Date.now },
  }],
  history: [{
    provider: { type: String, trim: true },
    shipmentId: { type: String, trim: true },
    trackingNumber: { type: String, trim: true },
    status: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    cancelledAt: { type: Date },
  }],
});

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    sellerShipments: [sellerShipmentSchema],
    subtotal: { type: Number, required: true },
    totalGst: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0, min: 0 },
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    couponCode: { type: String, trim: true, uppercase: true, maxlength: 32 },
    couponDiscount: { type: Number, default: 0, min: 0 },
    couponRedemptionStatus: { type: String, enum: ['Reserved', 'Redeemed', 'Released'] },
    cashbackAmount: { type: Number, default: 0, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['UPI', 'Credit/Debit Card', 'Net Banking', 'Razorpay', 'Cash on Delivery'],
      default: 'Cash on Delivery',
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid', 'Failed', 'Refund Pending', 'Refunded'],
      default: 'Pending',
    },
    // Gateway identifiers are stored only after the server creates/verifies them.
    razorpayOrderId: { type: String, unique: true, sparse: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    razorpaySignature: { type: String, select: false },
    paidAt: { type: Date },
    paymentCollectedAt: { type: Date },
    paymentCollectionReference: { type: String, trim: true, maxlength: 120 },
    paymentCollectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    razorpayRefundId: { type: String, unique: true, sparse: true },
    refundStatus: {
      type: String,
      enum: ['Not Required', 'Pending', 'Processed', 'Failed'],
      default: 'Not Required',
    },
    refundInitiatedAt: { type: Date },
    shippingAddress: {
      line1: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    shippingCarrier: { type: String, trim: true, maxlength: 100 },
    trackingNumber: { type: String, trim: true, maxlength: 120 },
    shippingProvider: { type: String, trim: true, maxlength: 40 },
    shippingShipmentId: { type: String, trim: true, maxlength: 160 },
    shipmentStatus: { type: String, trim: true, maxlength: 100 },
    shipmentEvents: [{
      status: { type: String, required: true },
      location: { type: String, trim: true, maxlength: 160 },
      description: { type: String, trim: true, maxlength: 300 },
      createdAt: { type: Date, default: Date.now },
    }],
    shipmentHistory: [{
      provider: { type: String, trim: true },
      shipmentId: { type: String, trim: true },
      trackingNumber: { type: String, trim: true },
      status: { type: String, trim: true },
      createdAt: { type: Date, default: Date.now },
      cancelledAt: { type: Date },
    }],
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
    returnRequest: {
      status: {
        type: String,
        enum: ['Not Requested', 'Requested', 'Approved', 'Rejected', 'Refund Pending', 'Refunded'],
        default: 'Not Requested',
      },
      reason: {
        type: String,
        enum: ['Damaged or defective', 'Wrong item received', 'Item not as described', 'Changed my mind', 'Other'],
      },
      requestedAt: { type: Date },
      reviewedAt: { type: Date },
      adminNote: { type: String, trim: true, maxlength: 500 },
      refundReference: { type: String, trim: true, maxlength: 120 },
      pickupStatus: { type: String, enum: ['Not scheduled', 'Creating', 'Creation uncertain', 'Scheduled', 'Picked up', 'Received', 'Cancelled'], default: 'Not scheduled' },
      pickupCarrier: { type: String, trim: true, maxlength: 100 },
      pickupTrackingNumber: { type: String, trim: true, maxlength: 120 },
      pickupProvider: { type: String, trim: true, maxlength: 40 },
      pickupShipmentId: { type: String, trim: true, maxlength: 160 },
      inspectionStatus: { type: String, enum: ['Not started', 'Pending', 'Accepted', 'Rejected'], default: 'Not started' },
      events: [{
        status: { type: String, required: true },
        note: { type: String, trim: true, maxlength: 300 },
        createdAt: { type: Date, default: Date.now },
      }],
    },
    status: {
      type: String,
      enum: ['Awaiting Payment', 'Pending', 'Cancellation Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
      default: 'Pending',
    },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });        // user's orders sorted by creation date //
orderSchema.index({ status: 1, createdAt: -1 });       // orders sorted by status and creation date in admin //

module.exports = mongoose.model('Order', orderSchema);
