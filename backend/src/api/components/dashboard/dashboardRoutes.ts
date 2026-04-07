import express from 'express';
import { getDashboardStats, resetDashboardStats, getActivityDetails } from './dashboardController';
import { protect, admin } from '../../middleware/authMiddleware';

const router = express.Router();

// --- CHANGE: Removed 'admin' middleware so Managers can load their dashboard ---
router.get('/stats', protect, getDashboardStats);

// These remain Admin Only
router.post('/reset', protect, admin, resetDashboardStats);
router.get('/activity', protect, admin, getActivityDetails);

export default router;