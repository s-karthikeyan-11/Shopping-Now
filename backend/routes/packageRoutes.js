const express = require('express');
const { protect, approvedSellerOnly } = require('../middleware/auth');
const { createPackage, getSellerPackageQr, markPackageReady, getCustomerDeliveryPin, getMyPackages, getOrderPackages } = require('../controllers/packageController');

const router = express.Router();

router.use(protect);
router.get('/mine', approvedSellerOnly, getMyPackages);
router.get('/order/:orderId', getOrderPackages);
router.post('/', approvedSellerOnly, createPackage);
router.get('/:id/qr', approvedSellerOnly, getSellerPackageQr);
router.post('/:id/ready', approvedSellerOnly, markPackageReady);
router.get('/:id/delivery-pin', getCustomerDeliveryPin);

module.exports = router;
