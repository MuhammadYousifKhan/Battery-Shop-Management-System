import express from 'express';
import { 
    getProducts, 
    getProductById, 
    createProduct, 
    updateProduct, 
    deleteProduct,
    getProductSnapshotPdf,
    adjustStock,
    recalculateStock, // <--- NEW IMPORT
    correctBatchCost
} from './productsController';
import { protect, admin } from '../../middleware/authMiddleware';

const router = express.Router();

router.route('/')
    .get(protect, getProducts)
    .post(protect, admin, createProduct);

// 🚀 NEW ROUTES
router.get('/snapshot/pdf', protect, getProductSnapshotPdf);
router.post('/adjust', protect, admin, adjustStock);
router.post('/recalculate', protect, admin, recalculateStock);
router.post('/batch-cost', protect, admin, correctBatchCost);

router.route('/:id')
    .get(protect, getProductById)
    .put(protect, admin, updateProduct)
    .delete(protect, admin, deleteProduct);

export default router;