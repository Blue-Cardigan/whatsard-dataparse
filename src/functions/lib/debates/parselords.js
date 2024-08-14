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
      id: id ? `lords${id}` : `lords${moment().format('YYYY-MM-DD')}z.${debateCounter}`,
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
        finalizeCurrentDebate();
        let headingContent = '';
        let headingType = '';
        
        // Get the text content of the node, excluding the <i> tag
        headingContent = node.textContent.split('-')[0].trim();
        
        // Find the <i> tag and get its content
        const italicTag = node.getElementsByTagName('i')[0];
        if (italicTag) {
          headingType = italicTag.textContent.trim();
        }
        
        // Remove trailing punctuation and whitespace from headingContent
        headingContent = headingContent.replace(/[^\w\s]+$/, '').trim();
        
        // If no italicized type is found, use the heading content as the type
        currentType = headingType || headingContent;
        
        lastMajorHeadingId = node.getAttribute('id')?.split('/').pop() || `major_${debateCounter + 1}`;
        currentDebate = createDebate(lastMajorHeadingId, headingContent, currentType);
        break;

      case 'speech':
        if (!currentDebate) {
          currentDebate = createDebate(lastMajorHeadingId, currentType, currentType);
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