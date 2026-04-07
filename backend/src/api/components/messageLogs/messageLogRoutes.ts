import express from 'express';
import { listMessageLogs } from './messageLogController';

const router = express.Router();

router.get('/', listMessageLogs);

export default router;
