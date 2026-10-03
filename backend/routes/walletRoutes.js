const express = require('express');
const router = express.Router();
const { protect, customerOnly } = require('../middleware/auth');
const { getMyWallet } = require('../controllers/walletController');

router.get('/', protect, customerOnly, getMyWallet);

module.exports = router;