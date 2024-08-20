const { DOMParser } = require('xmldom');
const createDebateProcessor = require('./debateProcessor');

function processXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const { createDebate, addSpeech, finalizeDebates, setCommitteeInfo, addDivisionCount, setHasMinorHeading } = createDebateProcessor('publicbills');
  const debates = [];
  let currentDebate = null;
  let currentType = '';

  function finalizeCurrentDebate() {
    if (currentDebate) {
      debates.push(...finalizeDebates([currentDebate]));
      currentDebate = null;
    }
  }

  function processNode(node) {
    switch (node.nodeName) {
      case 'bill':
        currentType = node.textContent.trim();
        break;

      case 'committee':
        const committeeInfo = {
          type: 'committee',
          chairmen: [],
          members: [],
          clerks: []
        };
        Array.from(node.childNodes).forEach(child => {
          if (child.nodeName === 'chairmen') {
            Array.from(child.getElementsByTagName('mpname')).forEach(mp => {
              committeeInfo.chairmen.push({
                id: mp.getAttribute('person_id'),
                name: mp.textContent.trim(),
                attending: mp.getAttribute('attending') === 'true'
              });
            });
          } else if (child.nodeName === 'mpname') {
            committeeInfo.members.push({
              id: child.getAttribute('person_id'),
              name: child.textContent.trim(),
              attending: child.getAttribute('attending') === 'true'
            });
          } else if (child.nodeName === 'clerk') {
            committeeInfo.clerks.push(child.textContent.trim());
          }
        });
        setCommitteeInfo(committeeInfo);
        break;

      case 'minor-heading':
        setHasMinorHeading();
        finalizeCurrentDebate();
        currentDebate = createDebate(node.getAttribute('id')?.split('/').pop(), node.textContent.trim(), currentType);
        break;

      case 'speech':
        if (!currentDebate) {
          const id = node.getAttribute('id')?.split('/').pop() || `speech_${debates.length + 1}`;
          currentDebate = createDebate(id, "No Title", currentType);
        }
        const speakerId = node.getAttribute('person_id')?.split('/').pop() || null;
        const speakerName = node.getAttribute('speakername') || null;
        const content = Array.from(node.getElementsByTagName('p'))
          .map(p => p.textContent.trim())
          .join('\n');
        const time = node.getAttribute('time') || null;
        addSpeech(currentDebate, speakerId, speakerName, content, time);
        break;

      case 'divisioncount':
        const divisionCount = {
          type: 'divisioncount',
          id: node.getAttribute('id'),
          number: node.getAttribute('divnumber'),
          ayes: node.getAttribute('ayes'),
          noes: node.getAttribute('noes'),
          votes: {
            aye: [],
            no: []
          }
        };
        Array.from(node.getElementsByTagName('mplist')).forEach(mplist => {
          const voteType = mplist.getAttribute('vote');
          Array.from(mplist.getElementsByTagName('mpname')).forEach(mp => {
            divisionCount.votes[voteType].push({
              id: mp.getAttribute('person_id'),
              name: mp.textContent.trim()
            });
          });
        });
        addDivisionCount(divisionCount);
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