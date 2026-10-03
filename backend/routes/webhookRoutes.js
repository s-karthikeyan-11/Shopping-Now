const express = require('express');
const router = express.Router();
const { handleRazorpayWebhook, handleRazorpayXPayoutWebhook } = require('../controllers/webhookController');

router.post('/razorpay', handleRazorpayWebhook);
router.post('/razorpayx', handleRazorpayXPayoutWebhook);

module.exports = router;