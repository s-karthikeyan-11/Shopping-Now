const express = require('express');
const router = express.Router();
const { protect, approvedSellerOnly } = require('../middleware/auth');
const {
  getProducts,
  getProductById,
  getSellerProducts,
  createSellerProduct,
  updateSellerProduct,
  deleteSellerProduct,
} = require('../controllers/productController');

router.get('/', getProducts);
router.get('/seller/me', protect, approvedSellerOnly, getSellerProducts);
router.post('/seller', protect, approvedSellerOnly, createSellerProduct);
router.put('/seller/:id', protect, approvedSellerOnly, updateSellerProduct);
router.delete('/seller/:id', protect, approvedSellerOnly, deleteSellerProduct);
router.get('/:id', getProductById);

module.exports = router;
