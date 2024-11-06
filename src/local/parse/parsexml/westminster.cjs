const { DOMParser } = require('xmldom');
const createDebateProcessor = require('../debateProcessor.cjs');

function processWestminsterXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const { createDebate, addSpeech, finalizeDebates } = createDebateProcessor('westminster');
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
        let headingContent = node.textContent.trim();
        if (currentSubtitle === '') {
          currentSubtitle = headingContent;
        } else {
          finalizeCurrentDebate();
          currentSubtitle = headingContent;
        }
        lastMajorHeadingId = node.getAttribute('id')?.split('/').pop() || `major_${debates.length + 1}`;
        break;

      case 'speech':
        if (!currentDebate) {
          const id = node.getAttribute('id')?.split('/').pop() || `speech_${debates.length + 1}`;
          const subtitle = node.getAttribute('type') || 'Unknown';
          currentDebate = createDebate(id, "No Title", subtitle);
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
        const fullTitle = node.textContent.trim();
        let title = fullTitle;
        let subtitle = title;

        // Extract text in square brackets for subtitle
        const match = fullTitle.match(/^(.*?)\s*—\s*\[(.*?)\]$/);
        if (match) {
          title = match[1].trim();
          subtitle = match[2].trim();
        }

        const id = node.getAttribute('id')?.split('/').pop() || `minor_${debates.length + 1}`;
        currentDebate = createDebate(id, title, subtitle);
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
  processXML: processWestminsterXML
};