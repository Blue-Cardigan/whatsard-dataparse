const { DOMParser } = require('xmldom');
const createDebateProcessor = require('../debateProcessor.cjs');

function processLordsXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const { createDebate, addSpeech, finalizeDebates } = createDebateProcessor('lords');
  const debates = [];
  let currentDebate = null;
  let currentSubtitle = '';
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
        
        
        currentSubtitle = headingType || headingContent;
        
        lastMajorHeadingId = node.getAttribute('id')?.split('/').pop() || `major_${debates.length + 1}`;
        currentDebate = createDebate(lastMajorHeadingId, headingContent, currentSubtitle);
        break;

      case 'speech':
        if (!currentDebate) {
          currentDebate = createDebate(lastMajorHeadingId, currentSubtitle, currentSubtitle);
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
        currentDebate = createDebate(id, title, currentSubtitle);
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