import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

async function getPublicBillFiles(dateString) {
  const url = 'https://www.theyworkforyou.com/pwdata/scrapedxml/standing/';
  const response = await fetch(url);
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");

  const files = Array.from(doc.querySelectorAll('tr'))
    .reverse() // Reverse the array to start from the end
    .reduce((acc, el) => {
      const fileName = el.querySelector('td:nth-child(2) a')?.textContent;
      if (fileName?.endsWith('.xml') && fileName.includes(dateString)) {
        const lastModified = el.querySelector('td:nth-child(3)')?.textContent;
        acc.push({ fileName, lastModified: new Date(lastModified) });
      }
      return acc;
    }, []);

  return files;
}

export async function fetchXMLData(dateString = '', suffix = '', debateType = 'commons') {
  let url;
  if (debateType === 'publicbills') {
    if (!dateString) {
      throw new Error('Date string is required for public bills');
    }
    const matchingFiles = await getPublicBillFiles(dateString);
    if (matchingFiles.length === 0) {
      console.log(`No public bill files found for date ${dateString}`);
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
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const xmlData = await response.text();
    console.log(`Received ${xmlData.length} characters of XML data for ${debateType}`);
    return xmlData;
  } catch (error) {
    console.error(`Error fetching XML data: ${error}`);
    throw error;
  }
}