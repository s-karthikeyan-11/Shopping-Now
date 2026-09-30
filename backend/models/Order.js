const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
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

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    totalGst: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['UPI', 'Credit/Debit Card', 'Net Banking', 'Razorpay', 'Cash on Delivery'],
      default: 'Cash on Delivery',
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid', 'Failed'],
      default: 'Pending',
    },
    // Gateway identifiers are stored only after the server creates/verifies them.
    razorpayOrderId: { type: String, unique: true, sparse: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    razorpaySignature: { type: String, select: false },
    paidAt: { type: Date },
    shippingAddress: {
      line1: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: ['Awaiting Payment', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
      default: 'Pending',
    },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });        // user's orders sorted by creation date //
orderSchema.index({ status: 1, createdAt: -1 });       // orders sorted by status and creation date in admin //

module.exports = mongoose.model('Order', orderSchema);
