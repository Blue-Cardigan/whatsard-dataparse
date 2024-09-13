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
  startDate: getTodayDate(),
  endDate: getTomorrowDate(),  // Set to next day to process only one day
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
      stdio: 'pipe'  // Change this from 'inherit' to 'pipe'
    });

    childProcess.stdout.on('data', (data) => {
      console.log(`${scriptName} output: ${data}`);
    });

    childProcess.stderr.on('data', (data) => {
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

async function processDebateType(startDate, endDate, debateType, suffix) {
  try {
    let xmlFound = false;
    while (!isAfter(currentDate, endDateDate)) {
      const formattedDate = format(currentDate, 'yyyy-MM-dd');
      
      for (const suffix of suffixes) {
        const xmlString = await fetchXMLData(formattedDate, suffix, debateType);
        if (xmlString) {
          await processAndStoreData(xmlString, formattedDate, suffix, debateType);
          xmlFound = true;
        }
      }
      
      if (xmlFound) {
        console.log(`${debateType} data for ${formattedDate} processed and stored`);
      } else {
        console.log(`No ${debateType} data found for ${formattedDate}`);
      }
      currentDate = addDays(currentDate, 1);
    }
    
    return xmlFound;
  } catch (error) {
    console.error(`Error processing ${debateType}:`, error);
    return false;
  }
}

async function main(args) {
  const { debateType, startDate, endDate, suffix } = parseArguments(args);

  if (debateType.length === 0) {
    console.error('No valid debate types specified. Please use "commons", "lords", "westminster", or "publicbills"');
    process.exit(1);
  }

  console.log(`Processing debate types: ${debateType.join(', ')}`);
  console.log(`Starting from date: ${startDate}`);
  if (endDate) {
    console.log(`Ending at date: ${endDate}`);
  } else {
    console.log('Processing for a single date');
  }

  const results = {};
  for (const type of debateType) {
    const xmlFound = await processDebateType(startDate, endDate, type, suffix);
    results[type] = xmlFound;
  }

  const missingTypes = Object.entries(results)
    .filter(([type, found]) => (type === 'commons' || type === 'lords') && !found)
    .map(([type]) => type);

  if (missingTypes.length > 0) {
    console.log(`No XML files found for: ${missingTypes.join(', ')}. Exiting with status code 1.`);
    process.exit(1);
  } else {
    console.log('All processes completed successfully.');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('An error occurred:', error);
    process.exit(1);
  });
}

module.exports = { main };