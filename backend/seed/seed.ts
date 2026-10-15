import mongoose from 'mongoose';
import { env } from '../config/env';
import { seedSystemCategories } from '../services/expense.service';

async function main(): Promise<void> {
  try {
    await mongoose.connect(env.mongodbUri);
    await seedSystemCategories();
    // eslint-disable-next-line no-console
    console.log('System expense categories are ready. No sample business data was created.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Initialization failed:', error);
  process.exitCode = 1;
});
