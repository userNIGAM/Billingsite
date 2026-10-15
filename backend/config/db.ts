import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';
import '../models';
import { Bill } from '../models/bill.model';
import { DailyConsumption } from '../models/dailyConsumption.model';

mongoose.set('strictQuery', true);

let isConnected = false;

async function migrateStaffPayerIndexes(): Promise<void> {
  const obsoleteIndexes = [
    { model: Bill, name: 'khataId_1_bossId_1_periodStart_1_periodEnd_1' },
    { model: DailyConsumption, name: 'consumerId_1_bossId_1_businessDate_1_itemId_1_unitPricePaisa_1' },
  ];

  for (const { model, name } of obsoleteIndexes) {
    try {
      const indexes = await model.collection.indexes();
      if (indexes.some((index) => index.name === name)) {
        await model.collection.dropIndex(name);
        logger.info(`Removed obsolete unique index ${name}`);
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 26) continue;
      throw error;
    }
  }
  await Promise.all([Bill.createIndexes(), DailyConsumption.createIndexes()]);
}

export async function connectDB(): Promise<void> {
  if (isConnected) return;

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', err);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
    isConnected = false;
  });

  try {
    await mongoose.connect(env.mongodbUri);
  } catch (error) {
    if (error instanceof Error && error.name === 'MongooseServerSelectionError') {
      logger.error(
        'MongoDB server selection failed. For Atlas, add this machine\'s public IP to Project > Security > Network Access, confirm the cluster is running, and verify the database user credentials. For local development, start MongoDB and use mongodb://127.0.0.1:27017/canteen-khata.'
      );
    }
    throw error;
  }
  await migrateStaffPayerIndexes();
  isConnected = true;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  isConnected = false;
}
