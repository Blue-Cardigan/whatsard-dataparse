const { DOMParser } = require('xmldom');
const createDebateProcessor = require('../debateProcessor.cjs');

function processLordsXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const { createDebate, addSpeech, finalizeDebates } = createDebateProcessor('lords');
  const debates = [];
  let currentDebate = null;
  let currentType = '';
  let lastMajorHeadingId = null;

  function finalizeCurrentDebate() {
    if (currentDebate) {
      debates.push(...finalizeDebates([currentDebate]));
      currentDebate = null;
    }
  }

  function processNode(node) {
    switch (node.nodeName) {
      case 'major-heading':
        finalizeCurrentDebate();
        let headingContent = '';
        let headingType = '';
        
        // Remove the [HL] tag if it exists
        const hlMatch = node.textContent.match(/\[HL\]/);
        if (hlMatch) {
          headingContent += ' ' + hlMatch[0].trim();
        }
        
        headingContent = node.textContent.split(' -')[0].trim();
        
        const italicTag = node.getElementsByTagName('i')[0];
        if (italicTag) {
          headingType = italicTag.textContent.trim();
        }
        
        headingContent = headingContent.replace(/[^\w\s\[\]]+$/, '').trim();
        
        currentType = headingType || headingContent;
        
        lastMajorHeadingId = node.getAttribute('id')?.split('/').pop() || `major_${debates.length + 1}`;
        currentDebate = createDebate(lastMajorHeadingId, headingContent, currentType);
        break;

      case 'speech':
        if (!currentDebate) {
          currentDebate = createDebate(lastMajorHeadingId, currentType, currentType);
        }
        const speakerId = node.getAttribute('person_id')?.split('/').pop() || null;
        const speakerName = node.getAttribute('speakername') || 'No Name';
        const content = Array.from(node.getElementsByTagName('p'))
          .map(p => p.textContent.trim())
          .join('\n');
        const time = node.getAttribute('time') ? node.getAttribute('time').slice(0, 5) : '00:00';
        addSpeech(currentDebate, speakerId, speakerName, content, time);
        break;

      case 'minor-heading':
        finalizeCurrentDebate();
        const id = node.getAttribute('id')?.split('/').pop() || `minor_${debates.length + 1}`;
        const title = node.textContent.trim();
        currentDebate = createDebate(id, title, currentType);
        break;
    }

    if (node.childNodes) {
      Array.from(node.childNodes).forEach(processNode);
    }
  }

  processNode(xmlDoc.documentElement);
  finalizeCurrentDebate();

  return finalizeDebates(debates);
}

module.exports = {
  processXML: processLordsXML
};