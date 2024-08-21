const { validDebateTypes } = require('./config');
const { processSingleDebateType } = require('./batchProcessor');

const args = process.argv.slice(2);
const params = Object.fromEntries(args.map(arg => arg.split('=')));

const debateTypes = params.debateTypes === 'all' ? validDebateTypes : params.debateTypes.split(',');
const batchSize = parseInt(params.batchSize) || 128;
const startDate = params.startDate || null;
const endDate = params.endDate || null;

async function main() {
  for (const debateType of debateTypes) {
    console.log(`Processing ${debateType} from ${startDate || 'earliest'} to ${endDate || 'latest'}`);
    await processSingleDebateType(debateType, batchSize, startDate, endDate);
  }
}

main()
  .then(() => {
    console.log('Processing completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });