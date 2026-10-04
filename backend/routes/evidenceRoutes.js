const express = require('express');
const { protect } = require('../middleware/auth');
const { listPackageEvidence, streamEvidence } = require('../controllers/evidenceController');

const router = express.Router();

router.use(protect);
router.get('/package/:packageId', listPackageEvidence);
router.get('/:id/content', streamEvidence);

module.exports = router;
