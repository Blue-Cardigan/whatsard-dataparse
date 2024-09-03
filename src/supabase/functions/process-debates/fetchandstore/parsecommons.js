import parse from "https://denopkg.com/nekobato/deno-xml-parser/index.ts";
import { createDebateProcessor } from './debateProcessor.js';

export function processXML(xmlString) {
  const parsedXml = parse(xmlString);
  //store parsedXml as a json file
  Deno.writeTextFileSync('parsedXml.json', JSON.stringify(parsedXml));
  if (!parsedXml || !parsedXml.root) {
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
    switch (node.name) {
      case 'oral-heading':
        finalizeCurrentDebate();
        currentType = '';
        lastMajorHeadingId = node.attributes.id?.split('/').pop() || `oral_${debates.length + 1}`;
        break;

      case 'major-heading':
        let headingContent = node.content.trim();
        
        if (currentType === '') {
          currentType = headingContent;
        } else {
          finalizeCurrentDebate();
          currentType = headingContent;
        }
        lastMajorHeadingId = node.attributes.id?.split('/').pop() || `major_${debates.length + 1}`;
        break;

      case 'speech':
        if (!firstSpeechId) {
          firstSpeechId = node.attributes.id?.split('/').pop();
          firstSpeechType = node.attributes.type || 'No Type';
        }
        if (!currentDebate) {
          const debateId = lastMajorHeadingId || firstSpeechId;
          const debateType = currentType || firstSpeechType || 'No Type';
          const debateTitle = currentType || firstSpeechType || 'No Title';
          currentDebate = createDebate(debateId, debateTitle, debateType);
        }
        const speakerId = node.attributes.person_id?.split('/').pop() || null;
        const speakerName = node.attributes.speakername || 'No Name';
        const content = node.children
          .filter(child => child.name === 'p')
          .map(p => p.content.trim())
          .join('\n');
        const time = node.attributes.time ? node.attributes.time.slice(0, 5) : '00:00';
        addSpeech(currentDebate, speakerId, speakerName, content, time);
        break;

      case 'minor-heading':
        finalizeCurrentDebate();
        const id = node.attributes.id?.split('/').pop() || null;
        const title = node.content.trim();
        currentDebate = createDebate(id, title, currentType);
        break;
    }

    if (node.children) {
      node.children.forEach(processNode);
    }
  }

  processNode(parsedXml.root);
  finalizeCurrentDebate();

  // If no debates were created, create one based on the first speech
  if (debates.length === 0 && firstSpeechId) {
    const debate = createDebate(firstSpeechId, firstSpeechType || 'No Title', firstSpeechType || 'No Type');
    debates.push(...finalizeDebates([debate]));
  }

  return finalizeDebates(debates);
}