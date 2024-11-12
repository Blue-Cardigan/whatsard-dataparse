const axios = require('axios');
const { DOMParser } = require('@xmldom/xmldom');
const { ParliamentaryProcessor } = require('./parseCommons.cjs');
const { LordsProcessor } = require('./parseLords.cjs');
const { WestminsterHallProcessor } = require('./parseWestminster.cjs');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();
const { processDate: processCommittee } = require('./processCommittee.cjs');

async function fetchDebateXML(dateString, type = 'commons') {
  const baseUrls = {
    commons: `https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates${dateString}`,
    lords: `https://www.theyworkforyou.com/pwdata/scrapedxml/lordspages/daylord${dateString}`,
    westminster: `https://www.theyworkforyou.com/pwdata/scrapedxml/westminhall/westminster${dateString}`,
    committee: null // Committees use a different fetch mechanism
  };

  const baseUrl = baseUrls[type];
  if (type === 'committee') {
    return null; // Committee XML is fetched differently
  }
  if (!baseUrl) {
    throw new Error(`Invalid debate type: ${type}`);
  }

  // Try suffixes h through a in reverse order
  for (const suffix of ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']) {
    const url = `${baseUrl}${suffix}.xml`;
    try {
      const response = await axios.get(url);
      console.log(`Found data with suffix: ${suffix}`);
      return response.data;
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error(`Error fetching ${url}:`, error.message);
      }
      continue;
    }
  }
  return null;
}

async function processDebate(dateString, type = 'commons', mode = 'full') {
  try {
    // Special handling for committees
    if (type === 'committee') {
      const result = await processCommittee(dateString);
      return mode === 'skeleton' ? createSkeleton(result) : result;
    }

    const xmlData = await fetchDebateXML(dateString, type);
    if (!xmlData) {
      console.log(`No data found for ${type} on ${dateString}`);
      return null;
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlData, 'text/xml');
    
    let processor;
    switch(type) {
      case 'lords':
        processor = new LordsProcessor({
          date: dateString,
          includeInterventions: true
        });
        break;
      case 'westminster':
        processor = new WestminsterHallProcessor({
          date: dateString,
          includeInterventions: true
        });
        break;
      default:
        processor = new ParliamentaryProcessor({
          date: dateString,
          includeInterventions: true
        });
    }

    const result = processor.process(xmlDoc);
    
    if (!result?.business?.length) {
      console.log(`No business items found for ${type}`);
      return null;
    }

    const fullResult = {
      date: dateString,
      house: type,
      business: result.business,
      metadata: {
        ...result.metadata,
        processingDate: new Date().toISOString()
      }
    };

    return mode === 'skeleton' ? createSkeleton(fullResult) : fullResult;
  } catch (error) {
    console.error(`Error processing ${type} debate:`, error);
    throw error;
  }
}

function createSkeleton(obj) {
  if (Array.isArray(obj)) {
    // Special handling for speeches array - only return one example
    if (obj.length > 0 && obj[0]?.speakerId !== undefined) {
      return [createSkeleton(obj[0])];
    }
    // For other arrays, keep up to 3 items as examples
    return obj.slice(0, 3).map(item => createSkeleton(item));
  } else if (obj && typeof obj === 'object') {
    const skeleton = {};
    for (const key in obj) {
      skeleton[key] = createSkeleton(obj[key]);
    }
    return skeleton;
  }
  return null;
}

async function processDebatesForPeriod(startDate, numberOfDays = 1, types = ['commons', 'lords', 'westminster'], mode = 'full') {
  const results = {};
  const date = new Date(startDate);

  // Create output directory if it doesn't exist
  const outputDir = path.join(process.cwd(), 'output');
  await fs.mkdir(outputDir, { recursive: true });

  for (let i = 0; i < numberOfDays; i++) {
    const dateString = date.toISOString().split('T')[0];
    console.log(`Processing ${dateString}...`);

    for (const type of types) {
      console.log(`- Processing ${type}...`);
      try {
        const result = await processDebate(dateString, type, mode);
        if (result) {
          if (!results[dateString]) {
            results[dateString] = {};
          }
          results[dateString][type] = result;

          // Save to file
          let fileName = `${dateString}-${type}.json`;
          if (mode === 'skeleton') {
            fileName = `${fileName.split('.')[0]}-skeleton.json`;
          }
          const filePath = path.join(outputDir, fileName);
          await fs.writeFile(filePath, JSON.stringify(result, null, 2));
          console.log(`  Saved to ${filePath}`);
        }
      } catch (error) {
        console.error(`Failed to process ${type} for ${dateString}:`, error);
      }
    }

    // Move to next day
    date.setDate(date.getDate() + 1);
  }

  return Object.keys(results).length > 0 ? results : null;
}

// Command-line handling
if (require.main === module) {
  const date = process.argv[2];
  if (!date) {
    console.error('Please provide a date in YYYY-MM-DD format');
    process.exit(1);
  }

  let numberOfDays = 1;
  let types = [];
  let mode = 'full';

  // Parse arguments
  const args = process.argv.slice(3);
  args.forEach(arg => {
    if (!isNaN(arg)) {
      numberOfDays = parseInt(arg);
    } else if (['commons', 'lords', 'westminster', 'committee'].includes(arg)) {
      if (!types.includes(arg)) {
        types.push(arg);
      }
    } else if (arg === 'skeleton') {
      mode = 'skeleton';
    }
  });

  // If no types specified, default to all four
  if (types.length === 0) {
    types = ['commons', 'lords', 'westminster', 'committee'];
  }
  
  processDebatesForPeriod(date, numberOfDays, types, mode)
    .then(results => {
      if (results) {
        console.log('Successfully processed debates for all specified dates');
        console.log('Dates processed:', Object.keys(results).join(', '));
      } else {
        console.log('No debates found for the specified period');
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { processDebate, fetchDebateXML };