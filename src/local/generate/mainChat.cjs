require('dotenv').config();

const { batchProcessDebates } = require('./batchProcessor.cjs');
const { getPromptForCategory } = require('./getPrompt.cjs');
// Parse command line arguments
const args = process.argv.slice(2);
let batchSize = 100; // Default batch size
let debateTypes = ['all']; // Default to all debate types
let startDate = '2024-01-01'; // Default start date

args.forEach(arg => {
  if (!isNaN(parseInt(arg))) {
    batchSize = parseInt(arg);
  } else if (['commons', 'lords', 'westminster', 'publicbills', 'all'].includes(arg)) {
    if (debateTypes[0] === 'all') {
      debateTypes = [arg];
    } else {
      debateTypes.push(arg);
    }
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    startDate = arg;
  }
});

console.log(`Using batch size: ${batchSize}, debate types: ${debateTypes.join(', ')}, start date: ${startDate}`);

// Validation
if (batchSize <= 0) {
  console.error('Please provide a valid batch size (positive integer)');
  process.exit(1);
}

async function main() {
  if (debateTypes.includes('all')) {
    debateTypes = ['commons', 'lords', 'westminster', 'publicbills'];
  }
  await batchProcessDebates(batchSize, debateTypes, startDate, getPromptForCategory);
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