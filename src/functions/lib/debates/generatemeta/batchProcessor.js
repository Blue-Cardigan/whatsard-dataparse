const { uploadBatchFile, createBatch, checkBatchStatus, retrieveResults } = require('./openai');
const { fetchUnprocessedDebates, updateDatabase } = require('./db');
const { prepareBatchFile } = require('./debateProcessor');
const { GENERATION_TYPES } = require('./config');

async function processSingleDebateType(debateType, batchSize, startDate, endDate) {
  const debates = await fetchUnprocessedDebates(batchSize, debateType, startDate, endDate);
  
  if (debates.length === 0) {
    console.log(`No unprocessed debates found for ${debateType} within specified date range and size limit.`);
    return;
  }

  console.log(`Processing ${debates.length} debates for ${debateType}`);

  for (const generationType of GENERATION_TYPES) {
    const debatesToProcess = debates.filter(debate => {
      if (generationType === 'speeches') return debate.rewritten_speeches === null;
      if (generationType === 'analysis') return debate.analysis === null;
      if (generationType === 'labels') return debate.labels === null;
      return false;
    });

    if (debatesToProcess.length === 0) {
      console.log(`No debates need processing for ${generationType} in ${debateType}`);
      continue;
    }

    console.log(`Processing ${debatesToProcess.length} debates for ${generationType} in ${debateType}`);
    const batchFileName = await prepareBatchFile(debatesToProcess, debateType, generationType);
    const fileId = await uploadBatchFile(batchFileName);
    const batchId = await createBatch(fileId);
    const completedBatch = await checkBatchStatus(batchId);
    
    if (completedBatch.status === 'completed') {
      const results = await retrieveResults(completedBatch.output_file_id);
      if (results.length === 0) {
        console.error('No valid results retrieved from the batch');
        continue;
      }
      await updateDatabase(results, debateType);
      console.log(`Batch processing completed successfully for ${generationType}`);
    } else {
      console.error(`Batch processing failed or expired for ${generationType}`);
    }
  }
}

module.exports = {
  processSingleDebateType,
};