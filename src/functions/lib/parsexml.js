const { DOMParser } = require('xmldom');

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
      id: id || `debate_${debateCounter}`,
      title,
      type,
      speaker_ids: new Set(),
      speeches: []
    };
  }

  function addSpeech(debate, speakerId, speakerName, content) {
    if (speakerId) debate.speaker_ids.add(speakerId);
    debate.speeches.push({ speakername: speakerName, content });
  }

  function finalizeCurrentDebate() {
    if (currentDebate) {
      debates.push(currentDebate);
      currentDebate = null;
    }
  }

  function processNode(node) {
    switch (node.nodeName) {
      case 'oral-heading':
        finalizeCurrentDebate();
        currentType = '';
        lastMajorHeadingId = node.getAttribute('id')?.split('/').pop() || `oral_${debateCounter + 1}`;
        break;

      case 'major-heading':
        if (currentType === '') {
          currentType = node.textContent.trim();
        } else {
          finalizeCurrentDebate();
          currentType = node.textContent.trim();
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
        addSpeech(currentDebate, speakerId, speakerName, content);
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