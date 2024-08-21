import moment from 'https://deno.land/x/momentjs@2.29.1-deno/mod.ts';

export function createDebateProcessor(debateType) {
  let debateCounter = 0;
  let heldDebate = null;
  let committeeInfo = null;
  let divisionCounts = [];
  let hasMinorHeading = false;

  function createDebate(id, title, type) {
    debateCounter++;
    let debateId = id ? `${debateType}${id}` : null; // We'll assign the ID later for held debates
    return {
      id: debateId,
      title,
      type,
      speaker_ids: new Set(),
      speaker_names: new Set(),
      speeches: []
    };
  }

  function addSpeech(debate, speakerId, speakerName, content, time) {
    if (speakerId) debate.speaker_ids.add(speakerId);
    if (speakerName) debate.speaker_names.add(speakerName);
    debate.speeches.push({ speakername: speakerName, content, time });
  }

  function finalizeDebates(debates, currentDebate) {
    function finalizeCurrentDebate() {
      if (currentDebate) {
        if (currentDebate.id === null) {
          heldDebate = currentDebate;
        } else {
          if (heldDebate) {
            const [base, counter] = currentDebate.id.split('.');
            const newCounter = Math.max(0, parseInt(counter || '0') - heldDebate.speeches.length);
            heldDebate.id = `${base}.${newCounter}`;
            debates.push(heldDebate);
            heldDebate = null;
          }
          debates.push(currentDebate);
        }
        currentDebate = null;
      }
    }

    finalizeCurrentDebate();

    // Handle any remaining held debate
    if (heldDebate) {
      const lastDebate = debates[debates.length - 1];
      if (lastDebate && lastDebate.id) {
        const [base, counter] = lastDebate.id.split('.');
        const newCounter = Math.max(0, parseInt(counter || '0') - heldDebate.speeches.length);
        heldDebate.id = `${base}.${newCounter}`;
        debates.push(heldDebate);
      } else {
        console.warn('Unable to assign id to held debate');
      }
    }

    return debates.map(debate => ({
      ...debate,
      speaker_ids: Array.from(debate.speaker_ids),
      speaker_names: Array.from(debate.speaker_names)
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