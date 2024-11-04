// Add this import at the top of the file
const { ParliamentaryBusiness, ParliamentaryProcessor, SHARED_BUSINESS_TYPES } = require('./parliamentaryBusiness.cjs');

// Committee-specific business types
const STANDING_COMMITTEE_TYPES = {
  ...SHARED_BUSINESS_TYPES,
  BILL_CONSIDERATION: {
    markers: ['Public Bill Committee'],
    precedence: 1
  },
  WITNESS_EVIDENCE: {
    markers: ['Examination of Witnesses'],
    precedence: 2
  },
  CLAUSE_CONSIDERATION: {
    markers: ['Clause', 'Schedule', 'New Clause'],
    precedence: 3
  },
  AMENDMENTS: {
    markers: ['Amendment proposed', 'Amendment moved'],
    precedence: 4
  }
};

// Create a combined business types object
const COMBINED_BUSINESS_TYPES = {
  ...SHARED_BUSINESS_TYPES,
  ...STANDING_COMMITTEE_TYPES
};

// Add Standing Committee specific markers after SHARED_BUSINESS_TYPES
const STANDING_COMMITTEE_MARKERS = {
    CHAIR: {
        INTRO: ['in the Chair', '[', 'Chair]'],
        REMARKS: ['Order', 'Before we begin', 'I remind the Committee']
    },
    AMENDMENTS: {
        PROPOSAL: ['I beg to move', 'Amendment proposed'],
        GROUPING: ['with this it will be convenient to discuss'],
        WITHDRAWAL: ['Amendment, by leave, withdrawn'],
        DECISION: ['Question put', 'Amendment agreed to', 'Amendment negatived']
    },
    CLAUSES: {
        START: ['Clause', 'Schedule', 'New Clause'],
        DEBATE: ['stand part of the Bill', 'be brought up and read'],
        DECISION: ['Question put', 'Clause ordered to stand part of the Bill']
    },
    COMMITTEE: {
        ATTENDANCE: ['Members present'],
        TIMING: ['Ordered, That the following provisions shall apply'],
        ADJOURNMENT: ['Committee adjourned', 'further consideration be now adjourned']
    },
    DIVISIONS: {
        START: ['The Committee divided'],
        RESULT: ['Ayes', 'Noes', 'Question accordingly']
    }
};

class StandingCommitteeSection extends ParliamentaryBusiness {
  constructor(type, metadata = {}) {
    super(type, metadata);
    
    // Basic tracking
    this.chair = null;
    this.clerk = null;
    this.members = new Map();
    this.attendance = new Set();
    this.currentClause = null;
    this.amendments = [];
    this.votes = [];

    // Enhanced tracking
    this.actualStartTime = null;
    this.actualEndTime = null;
    this.speakingOrder = [];
    this.interventions = [];

    // Amendment tracking
    this.currentAmendment = null;
    this.amendmentProposers = new Map();
    this.amendmentVotes = new Map();

    // Clause tracking
    this.clauseVotes = new Map();
    this.clauseDebateTime = new Map();

    // Member participation tracking
    this.memberContributions = new Map();
    this.memberInterventions = new Map();

    // Add session tracking
    this.sessionInfo = {
      number: metadata.sessionNumber || null,
      chair: null,
      startTime: null,
      endTime: null
    };

    // Add sequence tracking
    this.speechSequence = 0;
    this.currentSpeech = null;
    this.speechChain = new Map(); // Track speech relationships

    this.currentAmendment = null;
    this.amendments = [];
    this.divisions = [];
    this.clauseUnderDiscussion = null;
    this.debate = {
        amendments: [],
        divisions: [],
        proceedings: [],
        statistics: {
            totalAmendments: 0,
            amendmentsAgreed: 0,
            amendmentsRejected: 0,
            divisions: 0
        }
    };
  }

  processSpeech(speech) {
    // Add sequence number
    this.speechSequence++;
    speech.sequenceNumber = this.speechSequence;
    
    // Track temporal relationships
    if (this.currentSpeech) {
      speech.previousSpeechId = this.currentSpeech.sequenceNumber;
    }
    this.currentSpeech = speech;

    // Handle interventions
    if (speech.type === 'Start Intervention') {
      speech.interruptedSpeechId = this.findInterruptedSpeech(speech.time);
    }

    // Track quoted text context
    if (speech.quoted_text) {
      speech.quoted_text = speech.quoted_text.map(quote => ({
        ...quote,
        sequenceNumber: this.speechSequence,
        speechContext: {
          speaker: speech.speaker_name,
          time: speech.time
        }
      }));
    }

    super.processSpeech(speech);

    // Track timing
    if (speech.time) {
      if (!this.actualStartTime) this.actualStartTime = speech.time;
      this.actualEndTime = speech.time;
    }

    // Track member participation
    if (speech.speakerId && speech.speakerName) {
      // Update attendance
      this.attendance.add(speech.speakerId);
      
      // Track speaking order
      if (!this.speakingOrder.includes(speech.speakerId)) {
        this.speakingOrder.push(speech.speakerId);
      }

      // Update member contributions
      if (!this.memberContributions.has(speech.speakerId)) {
        this.memberContributions.set(speech.speakerId, {
          name: speech.speakerName,
          speeches: 0,
          interventions: 0,
          amendments: 0,
          votes: 0
        });
      }
      
      const stats = this.memberContributions.get(speech.speakerId);
      if (speech.type === 'Start Speech') {
        stats.speeches++;
      } else if (speech.type === 'Intervention') {
        stats.interventions++;
      }
    }

    // Track amendments
    if (speech.content?.includes('Amendment proposed') || 
        speech.content?.includes('Amendment moved')) {
      this.currentAmendment = {
        id: this.amendments.length + 1,
        text: speech.content,
        proposer: speech.speakerName,
        time: speech.time,
        status: 'PROPOSED'
      };
      this.amendments.push(this.currentAmendment);
      
      if (speech.speakerId) {
        const stats = this.memberContributions.get(speech.speakerId);
        if (stats) stats.amendments++;
      }
    }

    // Track votes
    if (speech.content?.includes('Question put') || 
        speech.content?.includes('Division')) {
      const vote = {
        time: speech.time,
        subject: this.currentAmendment ? 
          `Amendment ${this.currentAmendment.id}` : 
          this.currentClause,
        result: speech.content?.includes('agreed to') ? 'AGREED' : 'DISAGREED'
      };
      this.votes.push(vote);

      if (this.currentAmendment) {
        this.currentAmendment.status = vote.result;
        this.amendmentVotes.set(this.currentAmendment.id, vote);
      } else if (this.currentClause) {
        this.clauseVotes.set(this.currentClause, vote);
      }
    }

    // Detect chair from opening statements
    if (speech.content?.includes('[') && speech.content?.includes('in the Chair]')) {
      const chairMatch = speech.content.match(/\[(.*?) in the Chair]/);
      if (chairMatch) {
        this.sessionInfo.chair = chairMatch[1];
        this.chair = chairMatch[1]; // Keep existing chair field for compatibility
      }
    }
  }

  findInterruptedSpeech(time) {
    // Find the most recent non-intervention speech before this time
    // ... implementation ...
  }

  processClause(node) {
    const clauseText = node.textContent.trim();
    this.currentClause = clauseText;
    this.clauseDebateTime.set(clauseText, {
      start: node.getAttribute('time'),
      end: null
    });
  }

  processCommitteeInfo(node) {
    // Process committee membership
    const members = Array.from(node.getElementsByTagName('mpname'));
    members.forEach(member => {
      const id = member.getAttribute('person_id');
      const name = member.getAttribute('membername');
      const attending = member.getAttribute('attending') === 'true';
      
      this.members.set(id, {
        name,
        attending,
        role: member.parentNode.tagName === 'chairmen' ? 'CHAIR' : 'MEMBER',
        party: this.extractParty(member),
        constituency: this.extractConstituency(member)
      });
      console.log(this.members);
    });

    // Process clerks
    const clerks = Array.from(node.getElementsByTagName('clerk'))
      .map(clerk => clerk.textContent.trim())
      .filter(clerk => clerk.length > 0);
    
    this.clerk = clerks;
  }

  extractParty(memberNode) {
    const text = memberNode.textContent;
    const partyMatch = text.match(/\((Labour|Conservative|Liberal Democrat|SNP|DUP|Independent)\)/);
    return partyMatch ? partyMatch[1] : null;
  }

  extractConstituency(memberNode) {
    const constituencyMatch = memberNode.textContent.match(/\((.*?)\)/);
    return constituencyMatch ? constituencyMatch[1] : null;
  }

  finalize() {
    // Close out any open timing
    if (this.currentClause) {
      const timing = this.clauseDebateTime.get(this.currentClause);
      if (timing && !timing.end) {
        timing.end = this.actualEndTime;
      }
    }

    return {
      ...super.finalize(),
      session: this.sessionInfo,
      chair: this.sessionInfo.chair, // Use session chair
      clerk: this.clerk,
      timing: {
        start: this.actualStartTime,
        end: this.actualEndTime
      },
      members: Array.from(this.members.entries()).map(([id, info]) => ({
        id,
        ...info
      })),
      attendance: Array.from(this.attendance),
      speakingOrder: this.speakingOrder,
      amendments: this.amendments,
      votes: this.votes,
      clauseDebates: Array.from(this.clauseDebateTime.entries()).map(([clause, timing]) => ({
        clause,
        ...timing
      })),
      memberParticipation: Array.from(this.memberContributions.entries()).map(([id, stats]) => ({
        id,
        ...stats
      })),
      // Add temporal metadata
      timeline: {
        speeches: this.speeches.map(speech => ({
          sequenceNumber: speech.sequenceNumber,
          time: speech.time,
          type: speech.type,
          speaker: speech.speaker_name,
          previousSpeechId: speech.previousSpeechId,
          interruptedSpeechId: speech.interruptedSpeechId
        }))
      }
    };
  }
    // Add helper method for marker matching
    matchesMarkers(content, markerConfig) {
        if (!content || !markerConfig) return false;
        
        // Handle nested marker objects
        if (typeof markerConfig === 'object' && !Array.isArray(markerConfig)) {
            return Object.values(markerConfig).some(markers => 
                this.matchesMarkers(content, markers)
            );
        }
        
        // Handle array of markers
        if (Array.isArray(markerConfig)) {
            return markerConfig.some(marker => 
                content.toLowerCase().includes(marker.toLowerCase())
            );
        }
        
        return false;
    }

    processNode(node) {
        if (!node || node.nodeType !== NODE_TYPES.ELEMENT_NODE) return;

        try {
            const content = node.textContent.trim();

            // Check for chair information
            if (this.matchesMarkers(content, STANDING_COMMITTEE_MARKERS.CHAIR.INTRO)) {
                this.processChairInfo(node);
            }

            // Check for amendments
            if (this.matchesMarkers(content, STANDING_COMMITTEE_MARKERS.AMENDMENTS.PROPOSAL)) {
                this.processAmendment(node);
            }

            // Check for clause consideration
            if (this.matchesMarkers(content, STANDING_COMMITTEE_MARKERS.CLAUSES.START)) {
                this.processClause(node);
            }

            // Check for divisions
            if (this.matchesMarkers(content, STANDING_COMMITTEE_MARKERS.DIVISIONS.START)) {
                this.processDivision(node);
            }

            super.processNode(node);
        } catch (error) {
            console.warn(`Error processing node in StandingCommitteeProcessor: ${error.message}`);
        }
    }

    // Add missing method for chair info processing
    processChairInfo(node) {
        const content = node.textContent.trim();
        const chairMatch = content.match(/\[(.*?) in the Chair\]/);
        if (chairMatch) {
            this.debate.chair = chairMatch[1].trim();
        }
    }

    // Add missing method for clause processing
    processClause(node) {
        const content = node.textContent.trim();
        this.clauseUnderDiscussion = content;
        this.debate.proceedings.push({
            type: 'CLAUSE',
            content: content,
            time: node.getAttribute('time') || null
        });
    }

    processAmendment(node) {
        const amendment = {
            number: this.extractAmendmentNumber(node),
            text: node.textContent.trim(),
            proposer: this.context.currentSpeaker,
            clause: this.clauseUnderDiscussion,
            status: 'PROPOSED',
            relatedAmendments: [],
            votes: null
        };
        
        this.currentAmendment = amendment;
        this.amendments.push(amendment);
        this.debate.statistics.totalAmendments++;
    }

    processDivision(node) {
        const division = {
            amendment: this.currentAmendment,
            ayes: this.extractVotes(node, 'aye'),
            noes: this.extractVotes(node, 'no'),
            result: null
        };

        console.log(division.ayes.length, division.noes.length);

        division.result = division.ayes.length > division.noes.length ? 'PASSED' : 'REJECTED';
        
        if (this.currentAmendment) {
            this.currentAmendment.status = division.result;
            this.currentAmendment.votes = division;
            this.debate.statistics[division.result === 'PASSED' ? 'amendmentsAgreed' : 'amendmentsRejected']++;
        }

        this.divisions.push(division);
        this.debate.statistics.divisions++;
    }
}

class StandingCommitteeProcessor extends ParliamentaryProcessor {
  constructor(config = {}) {
    super(config);
    this.businessTypes = COMBINED_BUSINESS_TYPES;
    this.currentSessionNumber = 0;
  }

  matchesMarkers(content, markers) {
    if (!content || !markers) return false;
    
    // Handle string markers
    if (typeof markers === 'string') {
      return content.includes(markers);
    }
    
    // Handle array of markers
    if (Array.isArray(markers)) {
      return markers.some(marker => content.includes(marker));
    }
    
    // Handle object with nested markers
    if (typeof markers === 'object') {
      return Object.values(markers).some(markerSet => 
        this.matchesMarkers(content, markerSet)
      );
    }
    
    return false;
  }

  determineBusinessType(node) {
    const content = node.textContent.trim().replace(/\s+/g, ' ');
    
    // Check for Committee-specific business first
    for (const [category, typeConfig] of Object.entries(STANDING_COMMITTEE_TYPES)) {
      if (this.matchesMarkers(content, typeConfig.markers)) {
        return { category, type: null };
      }
    }

    return super.determineBusinessType(node);
  }

  processMinorHeading(node) {
    const heading = {
      id: node.getAttribute('id'),
      text: node.textContent.trim()
    };

    if (this.currentBusiness) {
      // Check if heading indicates new clause consideration
      if (heading.text.startsWith('Clause') || 
          heading.text.startsWith('Schedule') ||
          heading.text.startsWith('New Clause')) {
        this.currentBusiness.processClause(node);
      }

      this.currentBusiness.metadata.minorHeadings =
        this.currentBusiness.metadata.minorHeadings || [];
      this.currentBusiness.metadata.minorHeadings.push(heading);
    }
  }

  processCommittee(node) {
    if (this.currentBusiness) {
      this.currentBusiness.processCommitteeInfo(node);
    }
  }

  createBusinessInstance(type, metadata) {
    this.currentSessionNumber++;
    return new StandingCommitteeSection(type, {
      ...metadata,
      sessionNumber: this.currentSessionNumber
    });
  }
}

// Export as named export and default export to match expected pattern
module.exports = StandingCommitteeProcessor;
module.exports.StandingCommitteeProcessor = StandingCommitteeProcessor;
module.exports.STANDING_COMMITTEE_TYPES = STANDING_COMMITTEE_TYPES;
module.exports.COMBINED_BUSINESS_TYPES = COMBINED_BUSINESS_TYPES;