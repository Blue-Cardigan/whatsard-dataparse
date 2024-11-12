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
  let currentSubtitle = '';
  let lastMajorHeadingId = null;
  let firstSpeechId = null;
  let firstSpeechSubtitle = null;

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
        currentSubtitle = '';
        lastMajorHeadingId = node.getAttribute('id')?.split('/').pop() || `oral_${debates.length + 1}`;
        break;

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
        if (!firstSpeechId) {
          firstSpeechId = node.getAttribute('id')?.split('/').pop();
          firstSpeechSubtitle = node.getAttribute('type') || 'No Subtitle';
        }
        
        // Check paragraphs for Urgent Question
        const paragraphs = Array.from(node.getElementsByTagName('p'));
        const isUrgentQuestion = paragraphs.length > 0 && 
          paragraphs[0].textContent.trim().startsWith('(Urgent Question):');
        
        if (!currentDebate) {
          const debateId = lastMajorHeadingId || firstSpeechId;
          const debateSubtitle = isUrgentQuestion ? 'Urgent Question' : (currentSubtitle || firstSpeechSubtitle || 'No Subtitle');
          const debateTitle = currentSubtitle || firstSpeechSubtitle || 'No Title';
          currentDebate = createDebate(debateId, debateTitle, debateSubtitle);
        }
        
        const speakerId = node.getAttribute('person_id')?.split('/').pop() || null;
        const speakerName = node.getAttribute('speakername') === 'Several hon. Members' || 
                            node.getAttribute('speakername') === 'Hon. Members:' ? 
                            'No Name' : 
                            node.getAttribute('speakername') || 'No Name';
        console.log(speakerName);
        const content = paragraphs
          .map(p => p.textContent.trim())
          .join('\n');
        const time = node.getAttribute('time') ? node.getAttribute('time').slice(0, 5) : '00:00';
        addSpeech(currentDebate, speakerId, speakerName, content, time);
        break;

      case 'minor-heading':
        finalizeCurrentDebate();
        const id = node.getAttribute('id')?.split('/').pop() || null;
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

  // If no debates were created, create one based on the first speech
  if (debates.length === 0 && firstSpeechId) {
    const debate = createDebate(firstSpeechId, firstSpeechSubtitle || 'No Title', firstSpeechSubtitle || 'No Subtitle');
    debates.push(...finalizeDebates([debate]));
  }

  return finalizeDebates(debates);
}

module.exports = {
  processXML: processCommonsXML
};
