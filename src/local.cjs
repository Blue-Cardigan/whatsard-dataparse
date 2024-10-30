const { spawn } = require('child_process');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Function to get today's date in YYYY-MM-DD format
function getYesterdayDate() {
  const today = new Date();
  return new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

const recessDates = [
  // Summer recess 2024
  '2024-07-30', '2024-07-31', 
  '2024-08-01', '2024-08-02', '2024-08-03', '2024-08-04', '2024-08-05', '2024-08-06', '2024-08-07', '2024-08-08', '2024-08-09', '2024-08-10', '2024-08-11', '2024-08-12', '2024-08-13', '2024-08-14', '2024-08-15', '2024-08-16', '2024-08-17', '2024-08-18', '2024-08-19', '2024-08-20', '2024-08-21', '2024-08-22', '2024-08-23', '2024-08-24', '2024-08-25', '2024-08-26', '2024-08-27', '2024-08-28', '2024-08-29', '2024-08-30', '2024-08-31', 
  '2024-09-01',
  // Conference recess 2024
  '2024-09-12', '2024-09-13', '2024-09-14', '2024-09-15', '2024-09-16', '2024-09-17', '2024-09-18', '2024-09-19', '2024-09-20', '2024-09-21', '2024-09-22', '2024-09-23', '2024-09-24', '2024-09-25', '2024-09-26', '2024-09-27', '2024-09-28', '2024-09-29', '2024-09-30', 
  '2024-10-01', '2024-10-02', '2024-10-03', '2024-10-04', '2024-10-05', '2024-10-06',
  // Autumn recess 2024
  '2024-11-06', '2024-11-07', '2024-11-08', '2024-11-09', '2024-11-10',
  // Christmas recess 2024-2025
  '2024-12-19', '2024-12-20', '2024-12-21', '2024-12-22', '2024-12-23', '2024-12-24', '2024-12-25', '2024-12-26', '2024-12-27', '2024-12-28', '2024-12-29', '2024-12-30', '2024-12-31', 
  '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05',
  // February recess 2025
  '2025-02-13', '2025-02-14', '2025-02-15', '2025-02-16', '2025-02-17', '2025-02-18', '2025-02-19', '2025-02-20', '2025-02-21', '2025-02-22', '2025-02-23',
  // Easter recess 2025
  '2025-04-03', '2025-04-04', '2025-04-05', '2025-04-06', '2025-04-07', '2025-04-08', '2025-04-09', '2025-04-10', '2025-04-11', '2025-04-12', '2025-04-13', '2025-04-14', '2025-04-15', '2025-04-16', '2025-04-17', '2025-04-18', '2025-04-19', '2025-04-20', '2025-04-21',
  // Whitsun recess 2025
  '2025-05-22', '2025-05-23', '2025-05-24', '2025-05-25', '2025-05-26', '2025-05-27', '2025-05-28', '2025-05-29', '2025-05-30', '2025-05-31', '2025-06-01',
  // Summer recess 2025
  '2025-07-22', '2025-07-23', '2025-07-24', '2025-07-25', '2025-07-26', '2025-07-27', '2025-07-28', '2025-07-29', '2025-07-30', '2025-07-31', 
  '2025-08-01', '2025-08-02', '2025-08-03', '2025-08-04', '2025-08-05', '2025-08-06', '2025-08-07', '2025-08-08', '2025-08-09', '2025-08-10', '2025-08-11', '2025-08-12', '2025-08-13', '2025-08-14', '2025-08-15', '2025-08-16', '2025-08-17', '2025-08-18', '2025-08-19', '2025-08-20', '2025-08-21', '2025-08-22', '2025-08-23', '2025-08-24', '2025-08-25', '2025-08-26', '2025-08-27', '2025-08-28', '2025-08-29', '2025-08-30', '2025-08-31'
];

function isWorkingDay(dateString) {
  const date = new Date(dateString);
  const dayOfWeek = date.getDay();
  return dayOfWeek !== 0 && dayOfWeek !== 6 && !recessDates.includes(dateString);
}

function getNextWorkingDay(dateString) {
  let nextDate = new Date(dateString);
  do {
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateString = nextDate.toISOString().split('T')[0];
    if (isWorkingDay(nextDateString)) {
      return nextDateString;
    }
  } while (true);
}

async function getMostRecentDate() {
  const supabase = createClient(process.env.DATABASE_URL, process.env.SERVICE_KEY);
  const tables = ['commons', 'lords', 'westminster', 'publicbills'];
  let mostRecentDate = null;

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .order('id', { ascending: false })
      .limit(1);

    if (error) {
      console.error(`Error fetching from ${table}:`, error);
      continue;
    }

    if (data && data.length > 0) {
      const id = data[0].id;
      const match = id.match(/\d{4}-\d{2}-\d{2}/);
      if (match) {
        const tableDate = match[0];
        if (!mostRecentDate || tableDate > mostRecentDate) {
          mostRecentDate = tableDate;
        }
      }
    }
  }

  if (!mostRecentDate) {
    console.warn('No recent date found, using yesterday as default');
    return getNextWorkingDay(getYesterdayDate());
  }

  // Return the next working day after the most recent date
  return getNextWorkingDay(mostRecentDate);
}

const params = {
  startDate: null,  // Will be set in main function
  endDate: getTodayDate(),
  debateType: 'commons,lords,westminster,publicbills',
  batchSize: 256
};

function runScript(scriptName, args) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    const process = spawn('node', [scriptPath, ...args]);

    let output = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`${scriptName} output: ${data}`);
    });

    process.stderr.on('data', (data) => {
      console.error(`${scriptName} error: ${data}`);
    });

    process.on('close', (code) => {
      if (code === 0) {
        console.log(`${scriptName} completed successfully`);
        resolve(output);
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });
  });
}

async function checkPreviousBatchStatus(startDate) {
  const { data, error } = await supabase
    .from('batch_status')
    .select('*')
    .eq('start_date', startDate)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error checking batch status:', error);
    return null;
  }

  return data?.[0] || null;
}

async function recordBatchStatus(batchId, status, debateType, startDate, endDate, completedAt = null) {
  const { error } = await supabase
    .from('batch_status')
    .insert({
      batch_id: batchId,
      status,
      debate_type: debateType,
      start_date: startDate,
      end_date: endDate,
      completed_at: completedAt
    });

  if (error) {
    console.error('Error recording batch status:', error);
  }
}

async function main() {
  try {
    params.startDate = await getMostRecentDate();
    console.log(`Processing from date: ${params.startDate} to ${params.endDate}`);

    // Run parse process first
    console.log('Starting parse process...');
    const parseOutput = await runScript('local/parse.cjs', [
      `startDate=${params.startDate}`,
      `endDate=${params.endDate}`,
      `debateType=${params.debateType}`
    ]);

    const debatesRetrieved = parseOutput.includes('successfully stored in Supabase');
    if (!debatesRetrieved) {
      console.log('No debates retrieved. Skipping generate process.');
      return;
    }

    // Check previous batch status
    const previousBatch = await checkPreviousBatchStatus(params.startDate);
    const useChatProcessor = previousBatch?.status === 'in_progress';

    if (useChatProcessor) {
      console.log('Previous batch still in progress. Using chat processor...');
      await runScript('local/generate.cjs', [
        `startDate=${params.startDate}`,
        `endDate=${params.endDate}`,
        `debateType=${params.debateType}`,
        `batchSize=${params.batchSize}`,
        'processor=chat'
      ]);
    } else {
      console.log('Starting batch processor...');
      await runScript('local/generate.cjs', [
        `startDate=${params.startDate}`,
        `endDate=${params.endDate}`,
        `debateType=${params.debateType}`,
        `batchSize=${params.batchSize}`
      ]);
    }

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