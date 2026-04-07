import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import MessageLog from '../../models/MessageLog';

// GET /api/message-logs?phone=92300...&limit=50&page=1
export const listMessageLogs = asyncHandler(async (req: Request, res: Response) => {
  const { phone, page = '1', limit = '100' } = req.query as any;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.max(1, Math.min(1000, parseInt(limit, 10) || 100));

  const filter: any = {};
  if (phone) filter.phone = phone;

  const total = await MessageLog.countDocuments(filter);
  const logs = await MessageLog.find(filter)
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * lim)
    .limit(lim)
    .lean();

  res.json({ total, page: pageNum, limit: lim, logs });
});
