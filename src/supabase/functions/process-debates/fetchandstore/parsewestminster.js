import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts';
import { createDebateProcessor } from './debateProcessor.js';

export function processXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const { createDebate, addSpeech, finalizeDebates } = createDebateProcessor('westminster');
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
          const id = node.getAttribute('id')?.split('/').pop() || `speech_${debates.length + 1}`;
          const type = node.getAttribute('type') || 'Unknown';
          currentDebate = createDebate(id, "No Title", type);
        }
        const speakerId = node.getAttribute('person_id')?.split('/').pop() || null;
        const speakerName = node.getAttribute('speakername') || 'No Name';
        const content = Array.from(node.getElementsByTagName('p'))
          .map(p => p.textContent.trim())
          .join('\n');
        const time = node.attributes.time ? node.attributes.time.slice(0, 5) : '00:00';
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

        const id = node.getAttribute('id')?.split('/').pop() || `minor_${debates.length + 1}`;
        currentDebate = createDebate(id, title, type);
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