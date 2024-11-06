const axios = require('axios');
const { DOMParser } = require('@xmldom/xmldom');
const { ParliamentaryProcessor } = require('./parseCommons.cjs');
const { LordsParliamentaryProcessor } = require('./parseLords.cjs');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function fetchDebateXML(dateString, type = 'commons') {
  const baseUrl = type === 'lords'
    ? `https://www.theyworkforyou.com/pwdata/scrapedxml/lordspages/daylord${dateString}`
    : `https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates${dateString}`;

  // Try suffixes h through a in reverse order
  for (const suffix of ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']) {
    const url = `${baseUrl}${suffix}.xml`;
    try {
      const response = await axios.get(url, { headers: BROWSER_HEADERS });
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

async function processDebate(dateString, type = 'commons') {
  try {
    const xmlData = await fetchDebateXML(dateString, type);
    if (!xmlData) {
      console.log(`No data found for ${type} on ${dateString}`);
      return null;
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlData, 'text/xml');
    
    const processor = type === 'lords'
      ? new LordsParliamentaryProcessor({
          date: dateString,
          includeInterventions: true
        })
      : new ParliamentaryProcessor({
          date: dateString,
          includeInterventions: true
        });

    const result = processor.process(xmlDoc);
    
    if (!result?.business?.length) {
      console.log(`No business items found for ${type}`);
      return null;
    }

    return {
      date: dateString,
      type: type,
      business: result.business,
      metadata: {
        ...result.metadata,
        processingDate: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error(`Error processing ${type} debate:`, error);
    throw error;
  }
}

async function processDebatesForPeriod(startDate, numberOfDays = 1, types = ['commons']) {
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
        const result = await processDebate(dateString, type);
        if (result) {
          if (!results[dateString]) {
            results[dateString] = {};
          }
          results[dateString][type] = result;

          // Save to file
          const fileName = `${dateString}-${type}.json`;
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

  // Parse arguments
  const args = process.argv.slice(3);
  args.forEach(arg => {
    if (!isNaN(arg)) {
      numberOfDays = parseInt(arg);
    } else if (['commons', 'lords'].includes(arg)) {
      if (!types.includes(arg)) {
        types.push(arg);
      }
    }
  });

  // If no types specified, default to commons
  if (types.length === 0) {
    types = ['commons'];
  }
  
  processDebatesForPeriod(date, numberOfDays, types)
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