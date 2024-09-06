const axios = require('axios');
const cheerio = require('cheerio');

async function getPublicBillFiles(dateString) {
  const url = 'https://www.theyworkforyou.com/pwdata/scrapedxml/standing/';
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);

  const files = $('tr')
    .toArray()
    .reverse() // Reverse the array to start from the end
    .reduce((acc, el) => {
      const fileName = $(el).find('td:nth-child(2) a').text();
      if (fileName.endsWith('.xml') && fileName.includes(dateString)) {
        const lastModified = $(el).find('td:nth-child(3)').text();
        acc.push({ fileName, lastModified: new Date(lastModified) });
      }
      return acc;
    }, []);

  return files;
}

async function fetchXMLData(dateString = '', suffix = '', debateType = 'commons') {
  let url;
  if (debateType === 'publicbills') {
    if (!dateString) {
      throw new Error('Date string is required for public bills');
    }
    const matchingFiles = await getPublicBillFiles(dateString);
    if (matchingFiles.length === 0) {
      return null;
    }
    // If suffix is provided, try to find a matching file
    let selectedFile = matchingFiles[0]; // Default to the first file
    if (suffix) {
      const suffixMatch = matchingFiles.find(file => file.fileName.includes(suffix));
      if (suffixMatch) {
        selectedFile = suffixMatch;
      }
    }
    url = `https://www.theyworkforyou.com/pwdata/scrapedxml/standing/${selectedFile.fileName}`;
  } else if (debateType === 'commons') {
    url = `https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates${dateString}${suffix}.xml`;
  } else if (debateType === 'lords') {
    url = `https://www.theyworkforyou.com/pwdata/scrapedxml/lordspages/daylord${dateString}${suffix}.xml`;
  } else if (debateType === 'westminster') {
    url = `https://www.theyworkforyou.com/pwdata/scrapedxml/westminhall/westminster${dateString}${suffix}.xml`;
  } else {
    throw new Error('Invalid debate type. Must be "commons", "lords", "westminster" or "publicbills"');
  }

  try {
    const response = await axios.get(url);
    console.log(`Received ${response.data.length} characters of XML data for ${debateType}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error(`Error fetching XML data: ${error}`);
    throw error;
  }
}

module.exports = { fetchXMLData };