const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');

const { getDashboard, getUsers, setUserBlocked, deleteUser } = require('../controllers/adminController');
const { listCoupons, createCoupon, updateCoupon } = require('../controllers/couponController');
const {
  adminGetProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');
const { adminGetOrders, updateOrderStatus, getOrderById, reviewOrderReturn, updateOrderReturnLogistics, cancelOrderShipment, cancelReturnPickup, reconcileUncertainShipment, reconcileUncertainReturnPickup } = require('../controllers/orderController');
const { getAdminSettlements, markCashCollected, markSettlementPaid, markSettlementRecovered, refreshRazorpayXPayout } = require('../controllers/settlementController');

router.use(protect, adminOnly); // every admin route requires an admin JWT

router.get('/dashboard', getDashboard);

router.get('/products', adminGetProducts);
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

router.get('/orders', adminGetOrders);
router.get('/orders/:id', getOrderById);
router.put('/orders/:id/status', updateOrderStatus);

router.get('/coupons', listCoupons);
router.post('/coupons', createCoupon);
router.put('/coupons/:id', updateCoupon);
router.patch('/orders/:id/return', reviewOrderReturn);
router.patch('/orders/:id/return/logistics', updateOrderReturnLogistics);
router.post('/orders/:id/return/pickup/cancel', cancelReturnPickup);
router.patch('/orders/:id/return/pickup/reconcile', reconcileUncertainReturnPickup);
router.patch('/orders/:id/collection', markCashCollected);
router.post('/orders/:id/shipment/cancel', cancelOrderShipment);
router.patch('/orders/:id/shipment/reconcile', reconcileUncertainShipment);

router.get('/payouts', getAdminSettlements);
router.patch('/payouts/:id/paid', markSettlementPaid);
router.patch('/payouts/:id/recovered', markSettlementRecovered);
router.get('/payouts/:id/provider-status', refreshRazorpayXPayout);

router.get('/users', getUsers);
router.put('/users/:id/block', setUserBlocked);
router.delete('/users/:id', deleteUser);

module.exports = router;
