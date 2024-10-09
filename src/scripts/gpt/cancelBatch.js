const OpenAI = require('openai');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function cancelBatch(batchId) {
  try {
    const cancelledBatch = await openai.batches.cancel(batchId);
    console.log('Batch cancelled successfully:', cancelledBatch);
  } catch (error) {
    console.error('Error cancelling batch:', error);
  }
}

// Get the batch ID from command line arguments
const batchId = process.argv[2];

if (!batchId) {
  console.error('Please provide a batch ID as a command line argument');
  process.exit(1);
}

cancelBatch(batchId)
  .then(() => {
    console.log('Cancellation request completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });