async function fetchXMLData(dateString = '', suffix = '', debateType = 'commons') {
  let url;
  if (debateType === 'commons') {
    url = `https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates${dateString}${suffix}.xml`;
  } else if (debateType === 'lords') {
    url = `https://www.theyworkforyou.com/pwdata/scrapedxml/lordspages/daylord${dateString}${suffix}.xml`;
  } else if (debateType === 'westminster') {
    url = `https://www.theyworkforyou.com/pwdata/scrapedxml/westminhall/westminster${dateString}${suffix}.xml`;
  } else {
    throw new Error('Invalid debate type. Must be "commons", "lords" or "westminster"');
  }

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const text = await response.text();
  console.log(`Received ${text.length} characters of XML data for ${debateType}`);

  return text;
}

// Example usage
async function main() {
  try {
    const dateArg = process.argv[2];
    const debateTypeArg = process.argv[3];
    const suffixes = ['a', 'b', 'c', 'd'];
    
    if (!dateArg || !debateTypeArg) {
      console.error('Please provide a date (YYYY-MM-DD) and debate type (commons or lords)');
      process.exit(1);
    }

    for (const suffix of suffixes) {
      const xmlData = await fetchXMLData(dateArg, suffix, debateTypeArg);
      if (xmlData) {
        console.log(`XML data fetched successfully for ${debateTypeArg} ${dateArg}${suffix}`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { fetchXMLData };