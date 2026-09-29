const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', maxlength: 4000 },
    category: { type: String, default: 'General', trim: true, maxlength: 60 },
    image: { type: String, default: '', maxlength: 2048 },
    price: { type: Number, required: true, min: 0 }, // base price before discount/GST
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    gstPercent: { type: Number, default: 0, min: 0, max: 100 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Final price = (price - discount) + GST on discounted price
productSchema.virtual('discountedPrice').get(function () {
  const discount = (this.price * this.discountPercent) / 100;
  return +(this.price - discount).toFixed(2);
});

productSchema.virtual('finalPrice').get(function () {
  const discounted = this.discountedPrice;
  const gst = (discounted * this.gstPercent) / 100;
  return +(discounted + gst).toFixed(2);
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });
productSchema.index({ isActive: 1, category: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
