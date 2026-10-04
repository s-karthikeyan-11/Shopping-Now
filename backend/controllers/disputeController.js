const mongoose = require('mongoose');
const Package = require('../models/Package');
const Evidence = require('../models/Evidence');
const Dispute = require('../models/Dispute');
const AIInspection = require('../models/AIInspection');
const { inspectDisputeEvidence } = require('../services/aiInspection');
const { recordAuditEvent } = require('../services/auditLog');

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);
const OPEN_STATUSES = ['Open', 'Seller Responded', 'Under Review'];

const disputeDetails = (query) => query
  .populate('package', 'packageId status')
  .populate('customer', 'name email')
  .populate('seller', 'name email')
  .populate('evidence', 'type originalFilename mimeType bytes sha256 status createdAt submittedBy')
  .populate('adminDecision.decidedBy', 'name email');

exports.createDispute = async (req, res) => {
  try {
    const { packageId, reason, description, evidenceIds = [] } = req.body;
    if (!isValidId(packageId)) return res.status(400).json({ message: 'A valid package ID is required' });
    if (!['Damaged item', 'Incorrect item', 'Missing item', 'Tampered package', 'Other'].includes(reason)) {
      return res.status(400).json({ message: 'Choose a valid complaint reason' });
    }
    const cleanDescription = typeof description === 'string' ? description.trim() : '';
    if (cleanDescription.length < 10 || cleanDescription.length > 2000 || !Array.isArray(evidenceIds) || evidenceIds.length > 10 || evidenceIds.some((id) => !isValidId(id))) {
      return res.status(400).json({ message: 'Provide a description and up to 10 valid evidence IDs' });
    }
    const pkg = await Package.findById(packageId).populate('order', 'user status');
    if (!pkg) return res.status(404).json({ message: 'Package not found' });
    if (String(pkg.order.user) !== String(req.user._id)) return res.status(403).json({ message: 'Not authorized to complain about this package' });
    if (pkg.status !== 'Delivered') return res.status(409).json({ message: 'A dispute can be submitted only after delivery' });
    const duplicate = await Dispute.findOne({ package: pkg._id, status: { $in: OPEN_STATUSES } }).lean();
    if (duplicate) return res.status(409).json({ message: 'An active dispute already exists for this package' });

    const selectedEvidence = evidenceIds.length
      ? await Evidence.find({ _id: { $in: evidenceIds }, package: pkg._id, type: 'unboxing', submittedBy: req.user._id, status: 'active' })
      : [];
    if (selectedEvidence.length !== new Set(evidenceIds.map(String)).size) {
      return res.status(400).json({ message: 'Each submitted evidence item must be your active unboxing evidence for this package' });
    }
    const dispute = await Dispute.create({
      order: pkg.order._id,
      package: pkg._id,
      customer: req.user._id,
      seller: pkg.seller,
      reason,
      description: cleanDescription,
      evidence: selectedEvidence.map((item) => item._id),
    });
    const packingEvidence = await Evidence.find({ package: pkg._id, type: 'packing', status: 'active' }).lean();
    const inspection = await inspectDisputeEvidence({ dispute, packingEvidence, unboxingEvidence: selectedEvidence });
    await AIInspection.create({ dispute: dispute._id, order: pkg.order._id, package: pkg._id, ...inspection });
    await recordAuditEvent(req, {
      action: 'dispute.created', entityType: 'Dispute', entityId: dispute._id, order: pkg.order._id, package: pkg._id,
      metadata: { reason, evidenceCount: selectedEvidence.length },
    });
    const populated = await disputeDetails(Dispute.findById(dispute._id));
    res.status(201).json({ dispute: populated, aiInspection: inspection });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ message: 'An active dispute already exists for this package' });
    res.status(500).json({ message: 'Unable to submit dispute' });
  }
};

exports.getMyDisputes = async (req, res) => {
  try {
    const filter = req.user.role === 'seller' ? { seller: req.user._id } : { customer: req.user._id };
    const disputes = await disputeDetails(Dispute.find(filter).sort({ createdAt: -1 }).limit(100));
    res.json(disputes);
  } catch {
    res.status(500).json({ message: 'Unable to load disputes' });
  }
};

exports.respondToDispute = async (req, res) => {
  try {
    const responseText = typeof req.body.response === 'string' ? req.body.response.trim() : '';
    if (responseText.length < 3 || responseText.length > 2000) return res.status(400).json({ message: 'Seller response must be between 3 and 2,000 characters' });
    const dispute = await Dispute.findOneAndUpdate(
      { _id: req.params.id, seller: req.user._id, status: 'Open' },
      { $set: { status: 'Seller Responded', sellerResponse: { text: responseText, respondedAt: new Date() } } },
      { new: true, runValidators: true }
    );
    if (!dispute) return res.status(409).json({ message: 'This dispute cannot be responded to' });
    await recordAuditEvent(req, { action: 'dispute.seller_responded', entityType: 'Dispute', entityId: dispute._id, order: dispute.order, package: dispute.package });
    res.json({ dispute: await disputeDetails(Dispute.findById(dispute._id)) });
  } catch {
    res.status(500).json({ message: 'Unable to respond to dispute' });
  }
};

exports.adminListDisputes = async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const disputes = await disputeDetails(Dispute.find(filter).sort({ createdAt: -1 }).limit(200));
    res.json(disputes);
  } catch {
    res.status(500).json({ message: 'Unable to load disputes' });
  }
};

exports.adminReviewDispute = async (req, res) => {
  try {
    const { decision, note = '' } = req.body;
    const cleanNote = typeof note === 'string' ? note.trim() : '';
    if (!['approve', 'reject', 'under_review'].includes(decision) || cleanNote.length > 2000) {
      return res.status(400).json({ message: 'Provide a valid decision and note' });
    }
    const dispute = await Dispute.findById(req.params.id);
    if (!dispute || !OPEN_STATUSES.includes(dispute.status)) return res.status(409).json({ message: 'This dispute cannot be reviewed' });
    if (decision === 'under_review') {
      dispute.status = 'Under Review';
    } else {
      dispute.status = decision === 'approve' ? 'Resolved - Approved' : 'Resolved - Rejected';
      dispute.adminDecision = { decision, note: cleanNote, decidedBy: req.user._id, decidedAt: new Date() };
    }
    await dispute.save();
    await recordAuditEvent(req, {
      action: `dispute.${decision}`, entityType: 'Dispute', entityId: dispute._id, order: dispute.order, package: dispute.package,
      metadata: { noteLength: cleanNote.length },
    });
    // This records the evidence decision only. Refund execution remains in the
    // existing protected return/refund workflow; AI never triggers it.
    res.json({ dispute: await disputeDetails(Dispute.findById(dispute._id)) });
  } catch {
    res.status(500).json({ message: 'Unable to review dispute' });
  }
};

exports.getDisputeInspection = async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id).select('customer seller');
    if (!dispute) return res.status(404).json({ message: 'Dispute not found' });
    if (req.user.role !== 'admin' && String(dispute.customer) !== String(req.user._id) && String(dispute.seller) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to view this inspection' });
    }
    const inspection = await AIInspection.findOne({ dispute: dispute._id }).lean();
    if (!inspection) return res.status(404).json({ message: 'No inspection exists for this dispute' });
    res.json(inspection);
  } catch {
    res.status(500).json({ message: 'Unable to load AI inspection' });
  }
};
