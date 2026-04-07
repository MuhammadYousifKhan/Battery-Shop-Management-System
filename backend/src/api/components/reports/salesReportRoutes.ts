import express from 'express';
import { downloadReportPDF, generateReport } from './salesReportController';
import { protect, admin } from '../../middleware/authMiddleware';

const router = express.Router();

// @route   POST /api/reports/generate
// @desc    Generate JSON Report for Frontend Display
// @access  Private/Admin
router.post('/generate', protect, admin, generateReport);

// @route   POST /api/reports/pdf
// @desc    Generate PDF Report Download
// @access  Private/Admin
router.post('/pdf', protect, admin, downloadReportPDF);

export default router;