import express from 'express';
import { getStoreSettings, updateStoreSettings } from './settingsController';
import { admin, protect } from '../../middleware/authMiddleware';

const router = express.Router();

router.get('/', getStoreSettings);
router.put('/', protect, admin, updateStoreSettings);

export default router;
