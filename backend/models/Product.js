const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'General', trim: true },
    image: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 }, // base price before discount/GST
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    gstPercent: { type: Number, default: 0, min: 0, max: 100 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
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

module.exports = mongoose.model('Product', productSchema);
