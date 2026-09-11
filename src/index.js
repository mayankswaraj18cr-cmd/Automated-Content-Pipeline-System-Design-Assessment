require('dotenv').config();
const cron = require('node-cron');
const connectDB = require('./config/db');
const processPublishingPipeline = require('./jobs/publisherJob');

const startApplication = async () => {
  await connectDB();

  console.log('[System Initialization] Recovering pipeline state...');
  // Run an immediate execution step on boot to handle missed cycles
  await processPublishingPipeline();

  // Schedule task to execute every hour on the hour ("0 * * * *")
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Executing scheduled hourly run...');
    await processPublishingPipeline();
  });

  console.log('[System Ready] Scheduler active. Running every hour.');
};

startApplication();
