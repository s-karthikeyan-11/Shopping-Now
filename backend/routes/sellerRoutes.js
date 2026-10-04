const express = require('express');
const { applySeller, getSellerProfile, getSellerOverview, listSellerApplications, updateSellerStatus, updateSellerCompliance, updateSellerDocument, updateSellerCommission } = require('../controllers/sellerController');
const { getSellerSettlements } = require('../controllers/settlementController');
const { protect, adminOnly, approvedSellerOnly } = require('../middleware/auth');

const router = express.Router();

router.post('/apply', protect, applySeller);
// Applicants may read their own status, but only approved sellers can access
// operational dashboard and payout information.
router.get('/me', protect, getSellerProfile);
router.get('/overview', protect, approvedSellerOnly, getSellerOverview);
router.get('/payouts', protect, approvedSellerOnly, getSellerSettlements);
router.get('/applications', protect, adminOnly, listSellerApplications);
router.patch('/:id/status', protect, adminOnly, updateSellerStatus);
router.patch('/:id/compliance', protect, adminOnly, updateSellerCompliance);
router.patch('/:id/documents/:documentId', protect, adminOnly, updateSellerDocument);
router.patch('/:id/commission', protect, adminOnly, updateSellerCommission);

module.exports = router;
