const { DOMParser } = require('xmldom');
const createDebateProcessor = require('../debateProcessor.cjs');

function processCommonsXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  if (!xmlDoc || !xmlDoc.documentElement) {
    throw new Error("Failed to parse XML document");
  }
  
  const { createDebate, addSpeech, finalizeDebates } = createDebateProcessor('commons');
  const debates = [];
  let currentDebate = null;
  let currentType = '';
  let lastMajorHeadingId = null;
  let firstSpeechId = null;
  let firstSpeechType = null;

  function finalizeCurrentDebate() {
    if (currentDebate) {
      debates.push(...finalizeDebates([currentDebate]));
      currentDebate = null;
    }
  }

  function processNode(node) {
    switch (node.nodeName) {
      case 'oral-heading':
        finalizeCurrentDebate();
        currentType = '';
        lastMajorHeadingId = node.getAttribute('id')?.split('/').pop() || `oral_${debates.length + 1}`;
        break;

      case 'major-heading':
        let headingContent = node.textContent.trim();
        
        if (currentType === '') {
          currentType = headingContent;
        } else {
          finalizeCurrentDebate();
          currentType = headingContent;
        }
        lastMajorHeadingId = node.getAttribute('id')?.split('/').pop() || `major_${debates.length + 1}`;
        break;

      case 'speech':
        if (!firstSpeechId) {
          firstSpeechId = node.getAttribute('id')?.split('/').pop();
          firstSpeechType = node.getAttribute('type') || 'No Type';
        }
        if (!currentDebate) {
          const debateId = lastMajorHeadingId || firstSpeechId;
          const debateType = currentType || firstSpeechType || 'No Type';
          const debateTitle = currentType || firstSpeechType || 'No Title';
          currentDebate = createDebate(debateId, debateTitle, debateType);
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
        const id = node.getAttribute('id')?.split('/').pop() || null;
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

  // If no debates were created, create one based on the first speech
  if (debates.length === 0 && firstSpeechId) {
    const debate = createDebate(firstSpeechId, firstSpeechType || 'No Title', firstSpeechType || 'No Type');
    debates.push(...finalizeDebates([debate]));
  }

  return finalizeDebates(debates);
}

module.exports = {
  processXML: processCommonsXML
};