const fs = require('fs').promises;
const path = require('path');
const { openai } = require('./utils/openai');
const { logError, logInfo } = require('./utils/logging');

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB in bytes

function splitBatchRequests(batchRequests) {
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;

  for (const request of batchRequests) {
    const requestSize = Buffer.byteLength(JSON.stringify(request), 'utf8');
    if (currentSize + requestSize > MAX_FILE_SIZE) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(request);
    currentSize += requestSize;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function createBatchFile(batchRequests) {
    const batchFileContent = batchRequests.map(JSON.stringify).join('\n');
    const filePath = path.join(process.cwd(), 'batchinput.jsonl');
    await fs.writeFile(filePath, batchFileContent);

    const stats = await fs.stat(filePath);
    logInfo(`Batch file size: ${stats.size} bytes`);
    if (stats.size > MAX_FILE_SIZE) {
        throw new Error(`Batch file size (${stats.size} bytes) exceeds maximum allowed size (${MAX_FILE_SIZE} bytes)`);
    }

    return filePath;
}

async function uploadBatchFile(filePath) {
  const file = await openai.files.create({
    file: await fs.readFile(filePath),
    purpose: 'batch'
  });
  return file.id;
}

async function createAndRunBatch(fileId) {
  const batch = await openai.batches.create({
    input_file_id: fileId,
    endpoint: "/v1/chat/completions",
    completion_window: "24h"
  });

  let completedBatch;
  do {
    completedBatch = await openai.batches.retrieve(batch.id);
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for 1 minute
  } while (completedBatch.status !== 'completed' && completedBatch.status !== 'failed' && completedBatch.status !== 'expired');

  return completedBatch;
}

async function retrieveResults(fileId) {
  const fileResponse = await openai.files.content(fileId);
  const fileContents = await fileResponse.text();
  return fileContents.split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

async function processBatch(debates, generateTypes, prepareBatchRequests, processBatchResults) {
  try {
    const batchRequests = await prepareBatchRequests(debates, generateTypes);

    for (const type of generateTypes) {
      logInfo(`Processing batch for ${type}`);
      const batchChunks = splitBatchRequests(batchRequests[type]);

      for (let i = 0; i < batchChunks.length; i++) {
        logInfo(`Processing ${type} batch chunk ${i + 1} of ${batchChunks.length}`);
        const batchFilePath = await createBatchFile(batchChunks[i]);
        const fileId = await uploadBatchFile(batchFilePath);
        const completedBatch = await createAndRunBatch(fileId);

        if (completedBatch.status === 'completed') {
          const results = await retrieveResults(completedBatch.output_file_id);
          await processBatchResults(results, [type]); // Pass only the current type
          logInfo(`Completed processing ${type} batch chunk ${i + 1}.`);
        } else {
          logError(`${type} batch chunk ${i + 1} processing ${completedBatch.status}.`);
        }

        await fs.unlink(batchFilePath);
      }
    }

    logInfo(`Completed processing all batch types.`);
  } catch (error) {
    logError(`Error processing batch:`, error);
  }
}

module.exports = {
  processBatch
};