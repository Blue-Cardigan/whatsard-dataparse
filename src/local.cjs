const { spawn } = require('child_process');
const path = require('path');

// Function to get today's date in YYYY-MM-DD format
function getYesterdayDate() {
  const today = new Date();
  return new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

function getTomorrowDate() {
  const today = new Date();
  return new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

const firstDay = getYesterdayDate();
const nextDay = new Date(new Date(firstDay).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
const tomorrow = getTomorrowDate();

const params = {
  startDate: '2024-09-10',
  endDate: getTodayDate(),  // Set to next day to process only one day
  debateType: 'commons,lords,westminster,publicbills',
  batchSize: 256
};

function runScript(scriptName, args) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    const childProcess = spawn('node', [scriptPath, ...args], {
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
        SERVICE_KEY: process.env.SERVICE_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY
      },
      stdio: 'inherit'
    });
    console.log(process.env);

    process.stdout.on('data', (data) => {
      console.log(`${scriptName} output: ${data}`);
    });

    process.stderr.on('data', (data) => {
      console.error(`${scriptName} error: ${data}`);
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`${scriptName} completed successfully`);
        resolve();
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  try {
    console.log(`Processing for date: ${params.startDate}`);

    console.log('Starting parse process...');
    await runScript('local/parse.cjs', [
      `startDate=${params.startDate}`,
      `endDate=${params.endDate || params.startDate}`,
      `debateType=${params.debateType}`
    ]);

    console.log('Starting generate process...');
    await runScript('local/generate.cjs', [
      `startDate=${params.startDate}`,
      `endDate=${params.endDate || params.startDate}`,
      `debateType=${params.debateType}`,
      `batchSize=${params.batchSize}`
    ]);

    console.log('All processes completed successfully.');
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('An error occurred:', error);
    process.exit(1);
  });
}

module.exports = { main };