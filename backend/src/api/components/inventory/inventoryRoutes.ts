import express from 'express';
import { addInventoryItem, getInventoryItems, updateInventoryItem, deleteInventoryItem } from './inventoryController';
import { protect, admin } from '../../middleware/authMiddleware';
const router = express.Router();
router.route('/').get(protect, admin, getInventoryItems).post(protect, admin, addInventoryItem);
router.route('/:id').put(protect, admin, updateInventoryItem).delete(protect, admin, deleteInventoryItem);
export default router;