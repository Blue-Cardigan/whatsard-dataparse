// Run with eg
// node src/local/generate.cjs startDate=2024-09-02 debateType=commons

const { processSingleDebateType } = require('./generate/supportingInfo.cjs');
const { batchProcessDebates } = require('./generate/batchProcessor.cjs');
const { getPromptForCategory } = require('./generate/getPromptForCategory.cjs');

async function runBothProcesses() {
  const args = process.argv.slice(2);
  const params = Object.fromEntries(args.map(arg => arg.split('=')));

  // Parameters for all processes
  const debateType = params.debateType ? 
    (params.debateType === 'all' ? ['commons', 'lords', 'westminster', 'publicbills'] : params.debateType.split(','))
    : ['commons', 'lords', 'westminster', 'publicbills'];
  const batchSize = parseInt(params.batchSize) || 32;
  const startDate = params.startDate || null;
  const endDate = params.endDate || null;

  console.log('Starting supportingInfo process (analysis and labels)...');
  for (const type of debateType) {
    await processSingleDebateType(type, batchSize, startDate, endDate, getPromptForCategory);
  }

  console.log('Starting mainChat process (rewrite)...');
  await batchProcessDebates(batchSize, debateType, startDate, getPromptForCategory);

  console.log('All processes completed.');
}

runBothProcesses()
  .then(() => {
    console.log('All processing completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });