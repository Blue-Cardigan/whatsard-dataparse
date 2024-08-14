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
  let isFirstMajorHeading = true;

  function createDebate(id, title, type) {
    debateCounter++;
    return {
      id: id ? `publicbills${id}` : `publicbills${moment().format('YYYY-MM-DD')}z.${debateCounter}`,
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
        
        if (isFirstMajorHeading) {
          currentType = headingContent;
          isFirstMajorHeading = false;
        } else {
          finalizeCurrentDebate();
          lastMajorHeadingId = node.getAttribute('id')?.split('/').pop() || `major_${debateCounter + 1}`;
          currentDebate = createDebate(lastMajorHeadingId, headingContent, currentType);
        }
        break;

      case 'speech':
        if (!currentDebate) {
          const id = lastMajorHeadingId || `speech_${debateCounter + 1}`;
          const content = Array.from(node.getElementsByTagName('p'))
            .map(p => p.textContent.trim())
            .join('\n');
          currentDebate = createDebate(id, content, currentType);
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
        const id = node.getAttribute('id')?.split('/').pop() || `minor_${debateCounter + 1}`;
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

  return debates.map(debate => ({
    ...debate,
    speaker_ids: Array.from(debate.speaker_ids)
  }));
}

module.exports = { processXML };