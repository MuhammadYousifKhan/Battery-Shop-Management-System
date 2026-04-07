import express from 'express';
import { addScrapBatteryTransaction, getScrapBatteryTransactions, updateScrapTransaction, deleteScrapTransaction } from './scrapBatteryController';
import { protect } from '../../middleware/authMiddleware';
const router = express.Router();
router.route('/').get(protect, getScrapBatteryTransactions).post(protect, addScrapBatteryTransaction);
router.route('/:id').put(protect, updateScrapTransaction).delete(protect, deleteScrapTransaction);
export default router;