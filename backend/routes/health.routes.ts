import { Router } from 'express';
import mongoose from 'mongoose';
import { sendSuccess } from '../utils/response';

const router = Router();

const MONGO_STATE_LABELS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

router.get('/', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    db: MONGO_STATE_LABELS[mongoose.connection.readyState] ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
});

export default router;
