const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: { type: String, enum: ['user', 'seller', 'delivery', 'admin', 'system'], required: true },
    action: { type: String, required: true, trim: true, maxlength: 120, index: true },
    entityType: { type: String, required: true, trim: true, maxlength: 80 },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', default: null, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, trim: true, maxlength: 64, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
