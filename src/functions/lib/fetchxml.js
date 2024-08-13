async function fetchXMLData(dateString = '', suffix = '') {
  const url = `https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates${dateString}${suffix}.xml`;
  console.log(`Fetching data from: ${url}`);

  const response = await fetch(url);
  console.log(`Response status: ${response.status}`);

  if (!response.ok) {
    if (response.status === 404) {
      console.log(`File not found: ${url}`);
      return null;
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const text = await response.text();
  console.log(`Received ${text.length} characters of XML data`);

  return text;
}

// Example usage
async function main() {
  try {
    // Get the date argument from command line, if provided
    const dateArg = process.argv[2];
    const suffixes = ['a', 'b', 'c', 'd'];
    
    for (const suffix of suffixes) {
      const xmlData = await fetchXMLData(dateArg, suffix);
      if (xmlData) {
        console.log(`XML data fetched successfully for ${dateArg}${suffix}`);
        // Process the XML data here
        // You may want to call a function from storedata.js to process and store the data
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the main function if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { fetchXMLData };