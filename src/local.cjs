const { spawn } = require('child_process');
const path = require('path');
const { format, addDays, parse, isAfter, isBefore, isValid } = require('date-fns');

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
      stdio: 'pipe'
    });

    let output = '';

    childProcess.stdout.on('data', (data) => {
      console.log(`${scriptName} output: ${data}`);
      output += data;
    });

    childProcess.stderr.on('data', (data) => {
      console.error(`${scriptName} error: ${data}`);
      output += data;
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`${scriptName} completed successfully`);
        resolve({ success: true, output });
      } else {
        console.error(`${scriptName} exited with code ${code}`);
        resolve({ success: false, output });
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

function parseArguments(args) {
  const parsedArgs = {
    debateType: ['commons', 'lords', 'westminster', 'publicbills'],
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: null,
    suffix: null
  };

  args.forEach(arg => {
    const [key, value] = arg.split('=');
    if (key === 'debateType') {
      parsedArgs.debateType = value.split(',').filter(type => 
        ['commons', 'lords', 'westminster', 'publicbills'].includes(type)
      );
    } else if (key === 'startDate' || key === 'endDate') {
      const dateMatch = value.match(/^(\d{4}-\d{2}-\d{2})([a-d])?$/);
      if (dateMatch) {
        const date = parse(dateMatch[1], 'yyyy-MM-dd', new Date());
        if (isValid(date)) {
          parsedArgs[key] = dateMatch[1];
          if (key === 'startDate' && dateMatch[2]) {
            parsedArgs.suffix = dateMatch[2];
          }
        } else {
          console.warn(`Invalid date for ${key}: ${value}. Using default or ignoring.`);
        }
      } else {
        console.warn(`Invalid date format for ${key}: ${value}. Using default or ignoring.`);
      }
    }
  });

  return parsedArgs;
}

async function main(args) {
  const { debateType, startDate, endDate } = parseArguments(args);

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

  console.log('Starting parse process...');
  const parseResult = await runScript('local/parse.cjs', [
    `startDate=${startDate}`,
    `endDate=${endDate || startDate}`,
    `debateType=${debateType.join(',')}`
  ]);

  if (!parseResult.success) {
    console.error('Parse process failed');
    process.exit(1);
  }

  const missingTypes = parseResult.output.match(/No XML files found for: (.+?)\./);
  if (missingTypes) {
    console.log(`No XML files found for: ${missingTypes[1]}. Exiting with status code 1.`);
    process.exit(1);
  }

  console.log('Starting generate process...');
  const generateResult = await runScript('local/generate.cjs', [
    `startDate=${startDate}`,
    `endDate=${endDate || startDate}`,
    `debateType=${debateType.join(',')}`,
    `batchSize=256`
  ]);

  if (!generateResult.success) {
    console.error('Generate process failed');
    process.exit(1);
  }

  console.log('All processes completed successfully.');
}

// Use process.argv.slice(2) to get command line arguments
const args = process.argv.slice(2);

main(args).catch(error => {
  console.error('An error occurred:', error);
  process.exit(1);
});

module.exports = { main };