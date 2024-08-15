const { DOMParser } = require('xmldom');
const moment = require('moment');

function processXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const debates = [];
  let currentDebate = null;
  let currentType = '';
  let debateCounter = 0;
  let committeeInfo = null;
  let divisionCounts = [];
  let hasMinorHeading = false;

  function createDebate(id, title, type) {
    debateCounter++;
    let debateId;
    if (id) {
      // Remove text between 'publicbills' and the date
      const dateMatch = id.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        const date = dateMatch[0];
        const suffix = id.substring(id.indexOf(date) + date.length);
        debateId = `publicbills${date}${suffix}`;
      } else {
        debateId = `publicbills${moment().format('YYYY-MM-DD')}z.${debateCounter}`;
      }
    } else {
      debateId = `publicbills${moment().format('YYYY-MM-DD')}z.${debateCounter}`;
    }
    return {
      id: debateId,
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
      if (committeeInfo) {
        currentDebate.speeches.unshift(committeeInfo);
      }
      if (divisionCounts.length > 0) {
        currentDebate.speeches.push(...divisionCounts);
        divisionCounts = []; // Clear division counts for next debate
      }
      debates.push(currentDebate);
      currentDebate = null;
    }
  }

  function processNode(node) {
    switch (node.nodeName) {
      case 'bill':
        currentType = node.textContent.trim();
        break;

      case 'committee':
        committeeInfo = {
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
        break;

      case 'minor-heading':
        hasMinorHeading = true;
        finalizeCurrentDebate();
        currentDebate = createDebate(node.getAttribute('id')?.split('/').pop(), node.textContent.trim(), currentType);
        break;

      case 'speech':
        if (!currentDebate) {
          const id = node.getAttribute('id')?.split('/').pop() || `speech_${debateCounter + 1}`;
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
        divisionCounts.push(divisionCount);
        break;
    }

    if (node.childNodes) {
      Array.from(node.childNodes).forEach(processNode);
    }
  }

  processNode(xmlDoc.documentElement);
  finalizeCurrentDebate();

  // If there were no minor headings, ensure we have at least one debate
  if (!hasMinorHeading && debates.length === 0) {
    debates.push(createDebate(null, "No Title", currentType));
  }

  return debates.map(debate => ({
    ...debate,
    speaker_ids: Array.from(debate.speaker_ids)
  }));
}

module.exports = { processXML };