const AuditLog = require('../models/AuditLog');

const recordAuditEvent = async (req, { action, entityType, entityId, order, package: packageId, metadata = {} }) =>
  AuditLog.create({
    actor: req.user?._id || null,
    actorRole: req.user?.role || 'system',
    action,
    entityType,
    entityId,
    order: order || null,
    package: packageId || null,
    metadata,
    ipAddress: String(req.ip || '').slice(0, 64),
  });

module.exports = { recordAuditEvent };
