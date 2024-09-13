const { DOMParser } = require('xmldom');

function extractSpeakers(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const speakers = new Map();

  function processNode(node) {
    if (node.nodeName === 'speech') {
      const speakerId = node.getAttribute('person_id')?.split('/').pop() || null;
      const speakerName = node.getAttribute('speakername') || node.getAttribute('name') || null;
      const speakerTitle = node.getAttribute('speakertitle') || null;

      if (speakerId && speakerName) {
        speakers.set(speakerId, { id: speakerId, name: speakerName, title: speakerTitle });
      }
    }

    if (node.childNodes) {
      Array.from(node.childNodes).forEach(processNode);
    }
  }

  processNode(xmlDoc.documentElement);

  return Array.from(speakers.values());
}

module.exports = { extractSpeakers };