const moment = require('moment');

function createDebateProcessor(debateType) {
  let debateCounter = 0;
  let heldDebate = null;
  let committeeInfo = null;
  let divisionCounts = [];
  let hasMinorHeading = false;

  function createDebate(id, title, type) {
    debateCounter++;
    let debateId;
    if (id) {
      if (debateType === 'publicbills') {
        const dateMatch = id.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
          const date = dateMatch[0];
          const suffix = id.substring(id.indexOf(date) + date.length);
          debateId = `publicbills${date}${suffix}`;
        } else {
          debateId = `publicbills${moment().format('YYYY-MM-DD')}z.${debateCounter}`;
        }
      } else {
        debateId = `${debateType}${id}`;
      }
    } else {
      debateId = `${debateType}${moment().format('YYYY-MM-DD')}z.${debateCounter}`;
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

  function finalizeDebates(debates, currentDebate) {
    if (currentDebate) {
      if (committeeInfo) {
        currentDebate.speeches.unshift(committeeInfo);
      }
      if (divisionCounts.length > 0) {
        currentDebate.speeches.push(...divisionCounts);
        divisionCounts = []; // Clear division counts for next debate
      }
      debates.push(currentDebate);
    }

    // If there were no minor headings in publicbills, ensure we have at least one debate
    if (debateType === 'publicbills' && !hasMinorHeading && debates.length === 0) {
      debates.push(createDebate(null, "No Title", ""));
    }

    return debates.map(debate => ({
      ...debate,
      speaker_ids: Array.from(debate.speaker_ids)
    }));
  }

  return {
    createDebate,
    addSpeech,
    finalizeDebates,
    setCommitteeInfo: (info) => { committeeInfo = info; },
    addDivisionCount: (count) => { divisionCounts.push(count); },
    setHasMinorHeading: () => { hasMinorHeading = true; }
  };
}

module.exports = createDebateProcessor;