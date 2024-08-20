const { DOMParser } = require('xmldom');
const createDebateProcessor = require('./debateProcessor');

function processXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const { createDebate, addSpeech, finalizeDebates } = createDebateProcessor('commons');
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
        if (!currentDebate) {
          if (currentType === '') {
            const content = Array.from(node.getElementsByTagName('p'))
              .map(p => p.textContent.trim())
              .join('\n');
            currentDebate = createDebate(lastMajorHeadingId, content, currentType);
          } else {
            currentDebate = createDebate(lastMajorHeadingId, currentType, currentType);
          }
        }
        const speakerId = node.getAttribute('person_id')?.split('/').pop() || null;
        const speakerName = node.getAttribute('speakername') || null;
        const content = Array.from(node.getElementsByTagName('p'))
          .map(p => p.textContent.trim())
          .join('\n');
        const time = node.getAttribute('time') || null;
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

  return finalizeDebates(debates);
}

module.exports = { processXML };