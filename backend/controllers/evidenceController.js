const mongoose = require('mongoose');
const Package = require('../models/Package');
const Evidence = require('../models/Evidence');
const DeliveryPartnerProfile = require('../models/DeliveryPartnerProfile');
const SellerProfile = require('../models/SellerProfile');
const { uploadEvidence } = require('../services/evidenceStorage');
const { recordAuditEvent } = require('../services/auditLog');
const crypto = require('crypto');

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);
const decodeFilename = (value) => {
  try {
    return decodeURIComponent(String(value || 'evidence')).replace(/[\\/\0]/g, '_').slice(0, 180) || 'evidence';
  } catch {
    return 'evidence';
  }
};
const safeEvidence = (item) => {
  const value = typeof item.toObject === 'function' ? item.toObject() : item;
  if (value.storage) delete value.storage.secureUrl;
  return value;
};

const loadPackage = (id, select = '') => Package.findById(id).select(select).populate('order', 'user status');

const canAccessPackage = async (req, pkg) => {
  if (req.user.role === 'admin') return true;
  if (String(pkg.order.user) === String(req.user._id) || String(pkg.seller) === String(req.user._id)) return true;
  if (req.user.role !== 'delivery' || !pkg.assignedDeliveryPartner) return false;
  const profile = await DeliveryPartnerProfile.findOne({ user: req.user._id, status: 'approved' }).select('_id').lean();
  return profile && String(profile._id) === String(pkg.assignedDeliveryPartner);
};

const authorizedUploader = async (req, pkg, type) => {
  if (type === 'packing') {
    if (req.user.role !== 'seller' || String(pkg.seller) !== String(req.user._id)) return false;
    const profile = await SellerProfile.findOne({ user: req.user._id, status: 'approved' }).select('_id').lean();
    return Boolean(profile);
  }
  if (type === 'unboxing') {
    return String(pkg.order.user) === String(req.user._id) && pkg.status === 'Delivered';
  }
  if (type === 'delivery_proof') {
    if (req.user.role !== 'delivery' || !pkg.assignedDeliveryPartner) return false;
    const profile = await DeliveryPartnerProfile.findOne({ user: req.user._id, status: 'approved' }).select('_id').lean();
    return profile && String(profile._id) === String(pkg.assignedDeliveryPartner);
  }
  return false;
};

exports.uploadEvidence = async (req, res) => {
  const type = String(req.get('x-evidence-type') || '').trim();
  const packageId = String(req.get('x-package-id') || '').trim();
  const filename = decodeFilename(req.get('x-file-name'));
  const mimeType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  try {
    if (!['packing', 'unboxing', 'delivery_proof'].includes(type) || !isValidId(packageId)) {
      return res.status(400).json({ message: 'Evidence type and package ID are required' });
    }
    const pkg = await loadPackage(packageId);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (!(await authorizedUploader(req, pkg, type))) return res.status(403).json({ message: 'Not authorized to upload this evidence type for the package' });
    const sha256 = crypto.createHash('sha256').update(req.body).digest('hex');
    const duplicate = await Evidence.findOne({ package: pkg._id, type, submittedBy: req.user._id, sha256, status: 'active' }).lean();
    if (duplicate) return res.status(409).json({ message: 'This evidence file has already been recorded', evidence: safeEvidence(duplicate) });

    const storage = await uploadEvidence({
      buffer: req.body,
      mimeType,
      filename,
      orderId: String(pkg.order._id),
      packageId: pkg.packageId,
    });
    const evidence = await Evidence.create({
      order: pkg.order._id,
      package: pkg._id,
      type,
      submittedBy: req.user._id,
      submittedRole: req.user.role,
      originalFilename: filename,
      mimeType,
      bytes: req.body.length,
      sha256,
      storage,
    });
    await recordAuditEvent(req, {
      action: `evidence.${type}.uploaded`, entityType: 'Evidence', entityId: evidence._id,
      order: pkg.order._id, package: pkg._id, metadata: { sha256, mimeType, bytes: req.body.length },
    });
    res.status(201).json({ evidence: safeEvidence(evidence) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Unable to store evidence' });
  }
};

exports.listPackageEvidence = async (req, res) => {
  try {
    if (!isValidId(req.params.packageId)) return res.status(400).json({ message: 'Invalid package ID' });
    const pkg = await loadPackage(req.params.packageId);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (!(await canAccessPackage(req, pkg))) return res.status(403).json({ message: 'Not authorized to view package evidence' });
    const evidence = await Evidence.find({ package: pkg._id, status: 'active' }).sort({ createdAt: -1 }).lean();
    res.json({ packageId: pkg.packageId, evidence: evidence.map(safeEvidence) });
  } catch {
    res.status(500).json({ message: 'Unable to load evidence' });
  }
};

exports.streamEvidence = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid evidence ID' });
    const evidence = await Evidence.findById(req.params.id).select('+storage.secureUrl');
    if (!evidence || evidence.status !== 'active') return res.status(404).json({ message: 'Evidence not found' });
    const pkg = await loadPackage(evidence.package);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (!(await canAccessPackage(req, pkg))) return res.status(403).json({ message: 'Not authorized to access this evidence' });
    const upstream = await fetch(evidence.storage.secureUrl, { signal: AbortSignal.timeout(30000) });
    if (!upstream.ok || !upstream.body) return res.status(502).json({ message: 'Evidence storage is unavailable' });
    res.set({
      'Content-Type': evidence.mimeType,
      'Content-Length': String(evidence.bytes),
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${evidence.originalFilename.replace(/[\"\\]/g, '_')}"`,
    });
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch {
    if (!res.headersSent) res.status(502).json({ message: 'Unable to retrieve evidence' });
    else res.end();
  }
};
