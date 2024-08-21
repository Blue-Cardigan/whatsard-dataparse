import { validDebateTypes } from './config.js';
import { processSingleDebateType } from './batchProcessor.js';

async function main(params) {
  const debateTypes = params.debateTypes === 'all' ? validDebateTypes : params.debateTypes.split(',');
  const batchSize = parseInt(params.batchSize) || 128;
  const startDate = params.startDate || null;
  const endDate = params.endDate || null;

  for (const debateType of debateTypes) {
    console.log(`Processing ${debateType} from ${startDate || 'earliest'} to ${endDate || 'latest'}`);
    await processSingleDebateType(debateType, batchSize, startDate, endDate);
  }
}

export { main };