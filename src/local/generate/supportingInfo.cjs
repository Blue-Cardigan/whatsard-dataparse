const { fetchUnprocessedDebates, prepareBatchFile, updateDatabase, uploadBatchFile, createBatch, checkBatchStatus, retrieveResults } = require('./batchProcessor.cjs');
const { getPromptForCategory } = require('./getPromptForCategory.cjs');
require('dotenv').config();

async function processSingleDebateType(debateType, batchSize, startDate, endDate) {
  const debates = await fetchUnprocessedDebates(batchSize, debateType, startDate, endDate);
  
  if (debates.length === 0) {
    console.log(`No unprocessed debates found for ${debateType} within specified date range and size limit.`);
    return;
  }

  const batchFileName = await prepareBatchFile(debates, debateType, getPromptForCategory);
  const fileId = await uploadBatchFile(batchFileName);
  const batchId = await createBatch(fileId);
  const completedBatch = await checkBatchStatus(batchId);
  
  if (completedBatch.status === 'completed') {
    const results = await retrieveResults(completedBatch.output_file_id);
    if (results.length === 0) {
      console.error('No valid results retrieved from the batch');
      return;
    }
    await updateDatabase(results, debateType);
    console.log('Batch processing completed successfully');
  } else {
    console.error('Batch processing failed or expired');
  }
}

module.exports = { processSingleDebateType };