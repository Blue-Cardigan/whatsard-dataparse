const { DOMParser } = require('xmldom');
const moment = require('moment');

function processXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const debates = [];
  let currentDebate = null;
  let currentType = '';
  let lastMajorHeadingId = null;
  let debateCounter = 0;

  function createDebate(id, title, type) {
    debateCounter++;
    return {
      id: id ? `westminster${id}` : `westminster${moment().format('YYYY-MM-DD')}z.${debateCounter}`,
      title,
      type,
      speaker_ids: new Set(),
      speeches: []
    };
  }

  function addSpeech(debate, speakerId, speakerName, content, time) {
    if (speakerId) debate.speaker_ids.add(speakerId);
    debate.speeches.push({ speakername: speakerName, content, time });
  }

  function finalizeCurrentDebate() {
    if (currentDebate) {
      debates.push(currentDebate);
      currentDebate = null;
    }
  }

  function processNode(node) {
    switch (node.nodeName) {
      case 'major-heading':
        let headingContent = node.textContent.trim();
        if (currentType === '') {
          currentType = headingContent;
        } else {
          finalizeCurrentDebate();
          currentType = headingContent;
        }
        lastMajorHeadingId = node.getAttribute('id')?.split('/').pop() || `major_${debateCounter + 1}`;
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
        const fullTitle = node.textContent.trim();
        let title = fullTitle;
        let type = title;

        // Extract text in square brackets for type
        const match = fullTitle.match(/^(.*?)\s*—\s*\[(.*?)\]$/);
        if (match) {
          title = match[1].trim();
          type = match[2].trim();
        }

        const id = node.getAttribute('id')?.split('/').pop() || `minor_${debateCounter + 1}`;
        currentDebate = createDebate(id, title, type);
        break;
    }

    if (node.childNodes) {
      Array.from(node.childNodes).forEach(processNode);
    }
  }

  processNode(xmlDoc.documentElement);
  finalizeCurrentDebate();

  return debates.map(debate => ({
    ...debate,
    speaker_ids: Array.from(debate.speaker_ids)
  }));
}

module.exports = { processXML };