const express = require('express');
const router = express.Router();
const { protect, sellerOnly } = require('../middleware/auth');
const {
  getProducts,
  getProductById,
  getSellerProducts,
  createSellerProduct,
  updateSellerProduct,
  deleteSellerProduct,
} = require('../controllers/productController');

router.get('/', getProducts);
router.get('/seller/me', protect, sellerOnly, getSellerProducts);
router.post('/seller', protect, sellerOnly, createSellerProduct);
router.put('/seller/:id', protect, sellerOnly, updateSellerProduct);
router.delete('/seller/:id', protect, sellerOnly, deleteSellerProduct);
router.get('/:id', getProductById);

module.exports = router;
