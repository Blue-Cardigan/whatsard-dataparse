import { validDebateTypes } from './config.js';
import { processSingleDebateType } from './batchprocessor.js';
import { fetchUnprocessedDebates } from './db.js';

async function main(params) {
  const debateTypes = params.debateTypes === 'all' ? validDebateTypes : params.debateTypes.split(',');
  const batchSize = parseInt(params.batchSize) || 128;
  const startDate = params.startDate || null;
  const endDate = params.endDate || null;

  for (const debateType of debateTypes) {
    let currentEndDate = null; // Start with the most recent debates
    let hasMoreDebates = true;

    while (hasMoreDebates) {
      console.log(`Processing ${debateType} up to ${currentEndDate || 'latest'}`);
      const debates = await fetchUnprocessedDebates(batchSize, debateType, null, currentEndDate);
      
      if (debates.length === 0) {
        hasMoreDebates = false;
        continue;
      }

      await processSingleDebateType(debateType, batchSize, null, currentEndDate);

      // Update the end date for the next iteration
      currentEndDate = debates[debates.length - 1].id.split(debateType)[1];
    }
  }
}

export { main };