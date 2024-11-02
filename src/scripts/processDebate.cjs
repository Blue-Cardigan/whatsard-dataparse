const axios = require('axios');
const { EnhancedParliamentaryProcessor, formatSpeechForDB } = require('./testCommons.cjs');
const fs = require('fs').promises;
const { DOMParser } = require('@xmldom/xmldom');

async function fetchDebateXML(dateString) {
  const url = `https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates${dateString}.xml`;

  try {
    const response = await axios.get(url);
    console.log(`Received ${response.data.length} characters of XML data`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.error(`No debate found for date: ${dateString}`);
      return null;
    }
    console.error(`Error fetching XML data: ${error}`);
    throw error;
  }
}

async function processDebateForDate(dateString) {
  try {
    
    // Fetch XML data
    const xmlData = await fetchDebateXML(dateString);
    if (!xmlData) {
      return;
    }

    // Parse XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlData, 'text/xml');

    // Process the document with enhanced processor
    const processor = new EnhancedParliamentaryProcessor({
      date: dateString,
      includeInterventions: true,
      trackReferences: true
    });
    
    const result = processor.process(xmlDoc);

    // Format the result for storage
    const formattedResult = {
      date: dateString,
      business: result.business.map(business => ({
        ...business,
        speeches: business.speeches.map(formatSpeechForDB)
      })),
      metadata: {
        ...result.metadata,
        processingDate: new Date().toISOString(),
        sourceUrl: `https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates${dateString}.xml`
      }
    };

    // Save to file
    const outputPath = `./output/${dateString}-debate.json`;
    await fs.mkdir('./output', { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(formattedResult, null, 2));
    
    console.log(`Successfully processed debate for ${dateString}`);
    console.log(`Output saved to: ${outputPath}`);

    // Return the result in case it's needed programmatically
    return formattedResult;

  } catch (error) {
    console.error('Error processing debate:', error);
    throw error;
  }
}

// Allow running from command line
if (require.main === module) {
  const date = process.argv[2];
  processDebateForDate(date)
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { processDebateForDate, fetchDebateXML };