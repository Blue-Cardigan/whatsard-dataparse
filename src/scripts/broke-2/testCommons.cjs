const { ParliamentaryBusiness, QuestionTimeSection, DivisionProcessor, SHARED_BUSINESS_TYPES } = require('./parliamentaryBusiness.cjs');

// Constants and types - extend from SHARED_BUSINESS_TYPES
const COMMONS_BUSINESS_TYPES = {
  ...SHARED_BUSINESS_TYPES,  // Keep shared types
  ORAL_QUESTIONS: {
    DEPARTMENTAL: {
      markers: ['Oral Answers to Questions'],
      subTypes: {
        SUBSTANTIVE: {
          markers: ['was asked—']
        },
        TOPICAL: {
          markers: ['Topical Questions']
        },
        URGENT: {
          markers: ['(Urgent Question):']
        },
        GROUPED: {
          markers: ['What steps', 'If he will'],
          requiresContext: true
        },
        DEPARTMENTAL: {
          markers: ['was asked—'],
          requiresContext: true
        },
        SUPPLEMENTARY: {
          markers: ['SupplementaryQuestion'],
          requiresContext: true
        }
      },
      SPEAKER_INTERVENTIONS: {
        markers: ['Lindsay Hoyle'],
        requiresSpeakerContext: true
      },
    },
    PMQs: {
      markers: ['Prime Minister', 'The Prime Minister was asked'],
      requiresAllMarkers: true
    }
  },
  LEGISLATION: {
    BILLS: {
      markers: ['Bill', 'First Reading', 'Second Reading'],
      precedence: 4
    },
    STATUTORY_INSTRUMENTS: {
      markers: ['Statutory Instrument', 'Order', 'Regulations'],
      precedence: 5
    }
  },
  PROCEDURAL: {
    STANDING_ORDERS: {
      markers: ['Standing Order No.'],
      precedence: 1
    },
    PROVISIONAL_COLLECTION: {
      markers: ['Provisional Collection of Taxes'],
      precedence: 1
    },
    POINTS_OF_ORDER: {
      markers: ['Point of Order'],
      precedence: 2
    }
  },
  DEBATES: {
    MAIN: {
      markers: ['Motion', 'Debate'],
      precedence: 6
    },
    ADJOURNMENT: {
      markers: ['Adjournment'],
      precedence: 7
    }
  },
  BUSINESS_QUESTIONS: {
    markers: ['Business of the House'],
    precedence: 3 
  }
};

// Add the new SpeechGroup class
class SpeechGroup extends ParliamentaryBusiness {
  constructor(type) {
    super(type);  // Call parent constructor
    this.initialQuestion = null;
    this.ministerAnswer = null;
    this.supplementaries = [];
    this.procedurals = [];
    this.startTime = null;
    this.endTime = null;
    this.questionNumber = null;
    this.groupedQuestions = [];
  }

  addSpeech(speech) {
    // Process the speech through parent class first
    super.processSpeech(speech);

    // Then handle SpeechGroup specific logic
    switch(speech.type) {
      case 'Start Question':
        if (speech.oral_qnum) {
          this.questionNumber = speech.oral_qnum;
          if (this.groupedQuestions.length > 0 || this.initialQuestion) {
            this.groupedQuestions.push(speech);
          } else {
            this.initialQuestion = speech;
          }
        }
        this.startTime = speech.time;
        break;
      case 'Start Answer':
        this.ministerAnswer = speech;
        break;
      case 'Start SupplementaryQuestion':
        this.supplementaries.push({
          question: speech,
          answer: null
        });
        break;
      case 'Start Answer':
      case 'Continuation Answer':
        if (this.supplementaries.length > 0 && !this.supplementaries[this.supplementaries.length - 1].answer) {
          this.supplementaries[this.supplementaries.length - 1].answer = speech;
        }
        break;
      default:
        if (this.isProceduralSpeech(speech)) {
          this.procedurals.push(speech);
          if (speech.content.includes('I call')) {
            this.lastICall = speech;
          }
        }
    }
    this.endTime = speech.time;
  }

  isProceduralSpeech(speech) {
    const proceduralIndicators = [
      'I call',
      'Order',
      'Point of Order',
      'The House will now proceed'
    ];
    return proceduralIndicators.some(indicator => 
      speech.content.includes(indicator)
    );
  }
}

// Add PMQsSection class extending QuestionTimeSection
class PMQsSection extends QuestionTimeSection {
  constructor(metadata = {}) {
    super({ category: 'ORAL_QUESTIONS', type: 'PMQs' }, metadata);
    this.engagements = [];
    this.ministerialStatements = [];
    this.lastSpeakerStatement = null;
    this.leadMinister = null;
    this.lastICall = null;
    this.pendingRole = null;
  }

  processSpeech(speech) {
    if (speech.content?.includes('I call')) {
      this.lastICall = speech;
      const roleMatch = speech.content.match(/I call (?:the )?([^.(]+)/i);
      if (roleMatch) {
        this.pendingRole = roleMatch[1].trim();
      }
    } else if (this.lastICall && !this.leadMinister && speech.speakerId) {
      this.leadMinister = {
        id: speech.speakerId,
        name: speech.speakerName,
        role: this.pendingRole || speech.role
      };
      this.lastICall = null;
      this.pendingRole = null;
    }

    // Handle special PMQs format where question numbers reset for engagements
    if (speech.type === 'Start Question' && speech.oral_qnum) {
      this.startNewEngagement(speech);
    }

    // Track Speaker interventions separately
    if (this.isSpeakerIntervention(speech)) {
      this.lastSpeakerStatement = speech;
      return;
    }

    super.processSpeech(speech);
  }

  startNewEngagement(speech) {
    this.finalizeCurrentGroup();
    this.engagements.push({
      questionNumber: speech.oral_qnum,
      startTime: speech.time,
      speeches: []
    });
  }

  isSpeakerIntervention(speech) {
    return speech.speakerName === 'Lindsay Hoyle' || 
           speech.content.includes('Order') ||
           speech.content.includes('I call');
  }
}

// Add SpeakersStatement class
class SpeakersStatement extends ParliamentaryBusiness {
  constructor(metadata = {}) {
    super({ category: 'STATEMENTS', type: 'SPEAKER' }, metadata);
    this.statement = null;
    this.responses = [];
    this.interventions = [];
  }

  processSpeech(speech) {
    // For Speaker's Statements, we should identify David Lammy as lead minister
    // from the first substantive answer
    if (!this.leadMinister && speech.type === 'Start Answer') {
      this.leadMinister = {
        id: speech.speakerId,
        name: speech.speakerName,
        role: speech.role || this.inferRoleFromContent(speech.content)
      };
    }

    super.processSpeech(speech);
  }

  inferRoleFromContent(content) {
    // Look for role indicators in the content
    if (content.includes('Deputy Foreign Secretary')) return 'Deputy Foreign Secretary';
    if (content.includes('Foreign Secretary')) return 'Foreign Secretary';
    return 'Minister';
  }
}

// Add DivisionProcessor class
class DivisionProcessor {
  constructor() {
    this.currentDivision = null;
    this.divisions = [];
  }

  processDivision(node) {
    if (node.nodeName !== 'division') return;

    const divisionCount = node.getElementsByTagName('divisioncount')[0];
    if (!divisionCount) return;

    const division = {
      id: node.getAttribute('id'),
      number: parseInt(node.getAttribute('divnumber')),
      time: node.getAttribute('time'),
      counts: {
        ayes: parseInt(divisionCount.getAttribute('ayes')) || 0,
        noes: parseInt(divisionCount.getAttribute('noes')) || 0
      },
      votes: this.extractVotes(node)
    };

    // Calculate additional metrics
    division.result = division.counts.ayes > division.counts.noes ? 'PASSED' : 'REJECTED';
    division.participation = division.counts.ayes + division.counts.noes;
    division.margin = Math.abs(division.counts.ayes - division.counts.noes);

    this.divisions.push(division);
    return division;
  }

  extractVotes(node) {
    const votes = {
      ayes: [],
      noes: []
    };

    // Get mplist elements directly
    const mpLists = node.getElementsByTagName('mplist');
    
    // Process Ayes (first mplist)
    const ayesList = mpLists[0];
    if (ayesList && ayesList.getAttribute('vote') === 'aye') {
      const mpNames = ayesList.getElementsByTagName('mpname');
      for (let i = 0; i < mpNames.length; i++) {
        const mp = mpNames[i];
        votes.ayes.push({
          name: mp.textContent.trim(),
          personId: mp.getAttribute('person_id')
        });
      }
    }

    // Process Noes (second mplist)
    const noesList = mpLists[1];
    if (noesList && noesList.getAttribute('vote') === 'no') {
      const mpNames = noesList.getElementsByTagName('mpname');
      for (let i = 0; i < mpNames.length; i++) {
        const mp = mpNames[i];
        votes.noes.push({
          name: mp.textContent.trim(),
          personId: mp.getAttribute('person_id')
        });
      }
    }

    return votes;
  }
}

// Export the module
module.exports = {
  PMQsSection,
  SpeakersStatement,
  QuestionTimeSection,
  SpeechGroup,
  DivisionProcessor,
  COMMONS_BUSINESS_TYPES
};

