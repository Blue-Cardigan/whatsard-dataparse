const { ParliamentaryContext, BUSINESS_TYPES } = require('./parseCommons.cjs');


// Add new business type for Standing Committees
BUSINESS_TYPES.COMMITTEES = {
  STANDING: {
    markers: ['Public Bill Committee', 'Standing Committee'],
    subTypes: {
      BILL_COMMITTEE: {
        markers: ['Bill Committee']
      }
    }
  }
};

// Base Speech class (since it's not properly imported)
class Speech {
  constructor(data) {
    this.speakerId = data.speakerId;
    this.speakerName = data.speakerName;
    this.time = data.time;
    this.content = data.content;
    this.type = this.parseType(data.content);
  }
}

class CommitteeSpeech extends Speech {
  constructor(data) {
    super(data);
    this.amendmentNumber = null;
    this.isIntervention = false;
    this.isPointOfOrder = false;
    this.clause = null;
    
    // Parse amendment number if this is a move speech
    if (this.type === 'AMENDMENT_MOVE') {
      const moveMatch = data.content.match(/amendment (\d+)/);
      if (moveMatch) {
        this.amendmentNumber = moveMatch[1];
      }
    }
  }

  parseType(content) {
    if (content.includes('I beg to move')) {
      return 'AMENDMENT_MOVE';
    }
    if (content.includes('Point of Order')) {
      this.isPointOfOrder = true;
      return 'POINT_OF_ORDER';
    }
    if (content.includes('intervene')) {
      this.isIntervention = true;
      return 'INTERVENTION';
    }
    return 'SPEECH';
  }
}

class CommitteeContext extends ParliamentaryContext {
  constructor() {
    super();
    this.billName = null;
    this.chair = null;
    this.members = new Set();
    this.amendments = [];
    this.divisions = [];
    this.currentAmendment = null;
    this.speeches = [];
  }

  updateContext(node) {
    super.updateContext(node);
    this.updateBillDetails(node);
    this.updateAmendments(node);
    this.trackDivisions(node);
  }

  updateBillDetails(node) {
    // Extract bill name from header
    const billMatch = node.textContent.match(/(.+) Bill/);
    if (billMatch) {
      this.billName = billMatch[1];
    }

    // Track chair
    const chairMatch = node.textContent.match(/\[(.*?) in the Chair\]/);
    if (chairMatch) {
      this.chair = chairMatch[1];
    }
  }

  updateAmendments(node) {
    // Check for amendment moves
    const moveMatch = node.textContent.match(/I beg to move amendment (\d+)/i);
    if (moveMatch) {
      const amendmentNumber = moveMatch[1];
      
      // Extract full amendment details
      const clauseMatch = node.textContent.match(/in clause (\d+)/);
      
      // Find existing amendment or create new one
      let amendment = this.amendments.find(a => a.number === amendmentNumber);
      if (!amendment) {
        amendment = {
          number: amendmentNumber,
          clause: clauseMatch ? clauseMatch[1] : null,
          movedBy: node.getAttribute('speakername'),
          outcome: null,
          speeches: [],
          relatedAmendments: [] // For amendments discussed together
        };
        this.amendments.push(amendment);
      }
      
      // Check for related amendments
      const withThisMatch = fullText.match(/With this it will be convenient to discuss amendment (\d+)/);
      if (withThisMatch) {
        amendment.relatedAmendments.push(withThisMatch[1]);
      }

      this.currentAmendment = amendment;
    }

    // Check for amendment outcomes
    const outcomeMatch = node.textContent.match(/Amendment(?:\s+\d+)?,\s+by\s+leave,\s+(withdrawn|agreed to|negatived)/i);
    if (outcomeMatch && this.currentAmendment) {
      this.currentAmendment.outcome = outcomeMatch[1].toLowerCase();
    }
  }

  trackDivisions(node) {
    if (node.textContent.includes('The Committee divided:')) {
      const division = {
        amendment: this.currentAmendment?.number,
        ayes: 0,
        noes: 0,
        votes: {
          ayes: [],
          noes: []
        },
        outcome: null,
        time: node.getAttribute('time')
      };

      // Look ahead for division results and vote details
      let nextNode = node.nextSibling;
      while (nextNode) {
        if (nextNode.tagName === 'divisioncount') {
          // Parse vote counts and voter lists
          division.ayes = parseInt(nextNode.getAttribute('ayes'));
          division.noes = parseInt(nextNode.getAttribute('noes'));
          
          // Parse voter details from mplists
          const mpLists = nextNode.getElementsByTagName('mplist');
          Array.from(mpLists).forEach(list => {
            const voteType = list.getAttribute('vote');
            const voters = Array.from(list.getElementsByTagName('mpname'))
              .map(mp => ({
                id: mp.getAttribute('person_id'),
                name: mp.getAttribute('membername')
              }));

            if (voteType === 'aye') {
              division.votes.ayes = voters;
            } else if (voteType === 'no') {
              division.votes.noes = voters;
            }
          });
        }
        else if (nextNode.textContent.includes('Question accordingly')) {
          division.outcome = nextNode.textContent.includes('negatived') ? 'negatived' : 'agreed to';
          break;
        }

        nextNode = nextNode.nextSibling;
      }

      this.divisions.push(division);
    }
  }
}

function parseCommittee(xml, date) {
  // Get first major heading ID for session ID
  const majorHeadings = Array.from(xml.getElementsByTagName('major-heading'));
  const committeeHeading = majorHeadings.find(heading => 
    heading.textContent.trim().includes('Public Bill Committee') ||
    heading.textContent.trim().includes('Standing Committee')
  );
  const sessionId = committeeHeading?.getAttribute('id') || `committee-${date}`;

  // Initialize context with witnesses
  const context = {
    bill: {
      title: xml.getElementsByTagName('bill')[0]?.getAttribute('title'),
    },
    leadership: {
      chairs: Array.from(xml.getElementsByTagName('chairmen')[0]?.getElementsByTagName('mpname') || [])
        .map(chair => ({
          id: chair.getAttribute('person_id'),
          name: chair.getAttribute('membername'),
          attending: chair.getAttribute('attending') === 'true'
        })),
      clerks: Array.from(xml.getElementsByTagName('clerk'))
        .map(clerk => clerk.textContent.trim())
        .filter(name => name.length > 0)
        .map(name => ({ name }))
    },
    members: Array.from(xml.getElementsByTagName('mpname'))
      .filter(mp => mp.parentNode.tagName !== 'chairmen')
      .map(mp => {
        const fullText = mp.textContent.trim();
        const constituencyNode = mp.getElementsByTagName('i')[0];
        const constituencyText = constituencyNode?.textContent.trim();
        
        // Get text after constituency node for party
        let partyText = '';
        if (constituencyNode) {
          let node = constituencyNode.nextSibling;
          while (node) {
            if (node.nodeType === 3) { // Text node
              partyText += node.textContent.trim();
            }
            node = node.nextSibling;
          }
        }
        
        // Extract party from parentheses after constituency
        const partyMatch = partyText.match(/\((.*?)\)$/);
        
        return {
          id: mp.getAttribute('person_id'),
          name: mp.getAttribute('membername'),
          constituency: constituencyText?.replace(/[()]/g, ''),
          party: partyMatch ? partyMatch[1] : null,
          role: constituencyText?.includes('Parliamentary Under-Secretary') 
            ? 'minister' 
            : 'member',
          attending: mp.getAttribute('attending') === 'true'
        };
      }),
    witnesses: Array.from(xml.getElementsByTagName('witness'))
      .map(w => {
        // Get text content, defaulting to empty string if undefined
        const content = w.textContent || '';
        return content.trim();
      })
      .filter(content => content.length > 0)
      .map(witness => {
        return witness
          .replace(/\s+/g, ' ')  // normalize whitespace
          .trim();
      }),
    proceedings: {
      items: [],
      divisions: [],
      currentClause: null,
      currentSection: null
    }
  };

  // Process all relevant elements in chronological order
  const speeches = Array.from(xml.getElementsByTagName('speech'));
  const divisions = Array.from(xml.getElementsByTagName('divisioncount'));
  const minorHeadings = Array.from(xml.getElementsByTagName('minor-heading'));
  
  // Combine and sort by column number
  const items = [...speeches, ...divisions, ...majorHeadings, ...minorHeadings]
    .sort((a, b) => {
      const aCol = parseInt(a.getAttribute('colnum')) || 0;
      const bCol = parseInt(b.getAttribute('colnum')) || 0;
      return aCol - bCol;
    });

  const businessItems = [];
  let currentBusinessItem = {
    id: `${sessionId}-main`,
    type: 'BILL_COMMITTEE',
    title: context.bill.title,
    subtitle: `${context.bill.title} - Public Bill Committee`,
    metadata: {
      chair: context.leadership.chairs[0],
      deputy_chair: context.leadership.chairs[1],
      clerks: context.leadership.clerks,
      members: context.members,
      witnesses: context.witnesses
    },
    speeches: [],
    divisions: []
  };

  let currentAmendment = null;
  let currentWitnessSession = null;

  // Process items chronologically
  for (const item of items) {
    try {
      if (item.tagName === 'minor-heading' && 
          item.textContent.includes('Examination of Witness')) {
        // Start new witness session
        if (currentWitnessSession?.speeches.length > 0) {
          businessItems.push(currentWitnessSession);
        }
        currentWitnessSession = createWitnessSession(item, context, date);
        continue;
      }

      if (item.tagName === 'speech') {
        const speech = parseSpeech(item, context);
        if (!speech) continue;

        // Update amendment tracking
        if (speech.type === 'AMENDMENT_MOVE') {
          currentAmendment = speech.amendment;
        } else if (speech.type === 'AMENDMENT_OUTCOME') {
          currentAmendment = null;
        }

        // Add speech to appropriate container
        if (currentWitnessSession) {
          currentWitnessSession.speeches.push(speech);
        } else {
          currentBusinessItem.speeches.push(speech);
        }
      }
      else if (item.tagName === 'divisioncount') {
        const division = parseDiv(item, context);
        if (division) {
          division.amendment = currentAmendment;
          currentBusinessItem.divisions.push(division);
        }
      }
    } catch (error) {
      console.error('Error processing item:', item.tagName, error);
      continue;
    }
  }

  // Add final witness session if exists
  if (currentWitnessSession?.speeches.length > 0) {
    businessItems.push(currentWitnessSession);
  }

  // Add main business item if it has content
  if (currentBusinessItem.speeches.length > 0 || currentBusinessItem.divisions.length > 0) {
    businessItems.push(currentBusinessItem);
  }

  // Return the data in the expected format
  return {
    date,
    type: 'committee',
    business: [{
      metadata: {
        id: sessionId,
        title: context.bill.title,
        subtitle: `Public Bill Committee`,
      },
      business_items: businessItems
    }]
  };
}

// Helper function to create witness session
function createWitnessSession(heading, context, date) {
  // Look for witness introduction after the heading
  let nextNode = heading.nextSibling;
  while (nextNode && nextNode.nodeType !== 1) {
    nextNode = nextNode.nextSibling;
  }

  if (!nextNode) return null;

  // Parse witness names from the evidence statement
  const witnessMatch = nextNode.textContent.match(/(.+?) gave evidence/);
  if (!witnessMatch) return null;

  const witnessNames = witnessMatch[1]
    .split(/ and |, /)
    .map(name => name.replace(/\s+OBE|\s+CBE|\s+MBE/g, '').trim())
    .filter(Boolean);

  // Create witness session structure
  return {
    id: `${context.sessionId}-witness-${witnessNames.join('-').toLowerCase().replace(/\s+/g, '-')}`,
    type: 'WITNESS_EXAMINATION',
    title: `Examination of Witnesses: ${witnessNames.join(', ')}`,
    subtitle: `${context.bill.title} - Public Bill Committee`,
    metadata: {
      chair: context.leadership.chairs[0],
      deputy_chair: context.leadership.chairs[1],
      clerks: context.leadership.clerks,
      members: context.members,
      witnesses: context.witnesses
    },
    speeches: [],
    start_time: nextNode.getAttribute('time')
  };
}

function parseDiv(divNode, context) {
  const division = {
    type: 'DIVISION',
    time: divNode.getAttribute('time'),
    divisionNumber: divNode.getAttribute('divnumber'),
    amendment: context.currentAmendment,
    counts: {
      ayes: parseInt(divNode.getAttribute('ayes')),
      noes: parseInt(divNode.getAttribute('noes'))
    },
    votes: {
      ayes: [],
      noes: []
    }
  };

  // Parse voter details from mplists
  const mpLists = divNode.getElementsByTagName('mplist');
  Array.from(mpLists).forEach(list => {
    const voteType = list.getAttribute('vote');
    const voters = Array.from(list.getElementsByTagName('mpname'))
      .map(mp => ({
        id: mp.getAttribute('person_id'),
        name: mp.getAttribute('membername')
      }));

    if (voteType === 'aye') {
      division.votes.ayes = voters;
    } else if (voteType === 'no') {
      division.votes.noes = voters;
    }
  });

  // Determine outcome based on vote counts
  division.outcome = division.counts.ayes > division.counts.noes ? 'agreed to' : 'negatived';

  return division;
}

function parseSpeech(speech, context) {
  const item = {
    id: speech.getAttribute('id'),
    time: speech.getAttribute('time'),
    type: determineType(speech),
    content: speech.textContent.trim()
  };

  // Add speaker details if present
  if (!speech.getAttribute('nospeaker')) {
    const speakerId = speech.getAttribute('person_id');
    const speakerName = speech.getAttribute('speakername');
    
    // Check if speaker is a witness
    const isWitness = context.witnesses.includes(speakerName);
    
    item.speaker = {
      id: speakerId,
      name: speakerName,
      type: isWitness ? 'witness' : 'member'
    };
  }

  // Handle Q&A format for witness sessions
  if (item.content.startsWith('Q ')) {
    item.type = 'WITNESS_QUESTION';
    item.content = item.content.substring(2).trim();
  } else if (item.content.endsWith('Q')) {
    item.type = 'WITNESS_QUESTION';
    item.content = item.content.substring(0, item.content.length - 1).trim();
  } else if (item.speaker?.type === 'witness') {
    item.type = 'WITNESS_ANSWER';
  }

  // Handle procedural events
  if (item.content.match(/I beg to move amendment (\d+)/)) {
    item.type = 'AMENDMENT_MOVE';
    const moveMatch = item.content.match(/I beg to move amendment (\d+)/);
    item.amendment = {
      number: moveMatch?.[1],
      clause: item.content.match(/in clause (\d+)/)?.[1]
    };
    context.currentAmendment = item.amendment.number;
  }
  else if (item.content.match(/Amendment (\d+), by leave, (withdrawn|negatived|agreed to)/i)) {
    const outcomeMatch = item.content.match(/Amendment (\d+), by leave, (withdrawn|negatived|agreed to)/i);
    item.type = 'AMENDMENT_OUTCOME';
    item.amendment = {
      number: outcomeMatch[1],
      outcome: outcomeMatch[2].toLowerCase()
    };
    context.currentAmendment = null;
  }
  else if (item.content.includes('The Committee divided:')) {
    item.type = 'DIVISION_START';
    item.amendment = context.currentAmendment;
  }
  else if (item.content.match(/Ayes (\d+), Noes (\d+)/)) {
    const divisionMatch = item.content.match(/Ayes (\d+), Noes (\d+)/);
    item.type = 'DIVISION_RESULT';
    const ayes = parseInt(divisionMatch[1]);
    const noes = parseInt(divisionMatch[2]);
    item.division = {
      amendment: context.currentAmendment,
      ayes,
      noes,
      outcome: ayes > noes ? 'agreed to' : 'negatived'
    };
  }
  else if (item.content.match(/Clause (\d+) ordered to stand part/)) {
    const clauseMatch = item.content.match(/Clause (\d+) ordered to stand part/);
    item.type = 'CLAUSE_AGREEMENT';
    item.clause = clauseMatch[1];
    context.currentClause = null;
  }
  else if (item.content.includes('Adjourned till')) {
    item.type = 'ADJOURNMENT';
    item.nextSitting = {
      date: speech.getElementsByTagName('phrase')[0]?.textContent,
      time: item.content.match(/at (.*?)(?:o'clock|$)/i)?.[1]?.trim()
    };
  }
  else if (item.content.includes('Written evidence reported')) {
    item.type = 'WRITTEN_EVIDENCE';
    item.evidence = Array.from(speech.getElementsByTagName('p'))
      .map(p => p.textContent.trim())
      .filter(Boolean);
  }

  // Handle division-related speeches
  if (item.content.includes('Question put, That the amendment be made')) {
    item.type = 'DIVISION_CALLED';
    item.amendment = context.currentAmendment;
  }
  else if (item.content.match(/The Committee divided: Ayes (\d+), Noes (\d+)/)) {
    item.type = 'DIVISION_RESULT';
    const divisionMatch = item.content.match(/Ayes (\d+), Noes (\d+)/);
    item.division = {
      amendment: context.currentAmendment,
      ayes: parseInt(divisionMatch[1]),
      noes: parseInt(divisionMatch[2])
    };
  }
  else if (item.content.includes('Question accordingly')) {
    item.type = 'DIVISION_OUTCOME';
    item.outcome = item.content.includes('negatived') ? 'negatived' : 'agreed to';
    item.amendment = context.currentAmendment;
  }

  return item;
}

function determineType(speech) {
  const type = speech.getAttribute('type');
  if (type === 'Continuation Speech') return 'CONTINUATION';
  if (speech.getAttribute('nospeaker')) return 'PROCEDURAL';
  return 'SPEECH';
}

module.exports = {
  parseCommittee,
  CommitteeContext,
  CommitteeSpeech,
  BUSINESS_TYPES
}; 