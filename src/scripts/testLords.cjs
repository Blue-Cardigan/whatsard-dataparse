// Add this import at the top of the file
const { ParliamentaryBusiness, ParliamentaryProcessor, SHARED_BUSINESS_TYPES } = require('./parliamentaryBusiness.cjs');


const LORDS_BUSINESS_TYPES = {
    QUESTIONS: {
      markers: ['_Question_'],
      subTypes: {
        ORAL: {
          markers: ['To ask His Majesty\'s Government']
        },
        PRIVATE_NOTICE: {
          markers: ['Private Notice Question']
        }
      }
    },
    // Add specific Lords business types
    DEBATES: {
      markers: ['_Debate_'],
      precedence: 3
    },
    OATHS: {
        markers: ['Oaths and Affirmations'],
        precedence: 1
    },
    DEATH_ANNOUNCEMENT: {
        markers: ['Death of a Member', 'Announcement'],
        precedence: 1
    },
    LORDS_QUESTIONS: {
        ORAL: {
        markers: ['Question'],
        subTypes: {
            PRIVATE_NOTICE: {
            markers: ['Private Notice Question']
            },
            URGENT: {
            markers: ['Urgent Question']
            }
        }
        },
        WRITTEN: {
        markers: ['Written Question']
        }
    },
    COMMITTEE_REPORTS: {
        markers: ['Report from the']
    },
    LORDS_LEGISLATION: {
        FIRST_READING: {
        markers: ['First Reading']
        },
        SECOND_READING: {
        markers: ['Second Reading']
        },
        COMMITTEE_STAGE: {
        markers: ['Committee Stage']
        },
        REPORT_STAGE: {
        markers: ['Report Stage']
        },
        THIRD_READING: {
        markers: ['Third Reading']
        }
    },
    GRAND_COMMITTEE: {
        markers: ['Grand Committee']
    }
    };

// Create a combined business types object
const COMBINED_BUSINESS_TYPES = {
  ...SHARED_BUSINESS_TYPES,
  ...LORDS_BUSINESS_TYPES
};

class LordsBusinessSection extends ParliamentaryBusiness {
  constructor(type, metadata = {}) {
    super(type, metadata);
    
    // Basic tracking (existing)
    this.peersPresent = new Set();
    this.leadSpeaker = null;
    this.ministerResponding = null;
    this.royalAssent = false;
    this.committeeStage = false;

    // Enhanced timing tracking
    this.actualStartTime = null;
    this.actualEndTime = null;
    this.imposedTimeLimits = [];

    // Enhanced speech type tracking
    this.speechTypes = {
      mainSpeeches: [],
      questions: [],
      answers: [],
      statements: [],
      pointsOfOrder: [],
      procedural: []
    };

    // Enhanced member tracking
    this.members = new Map();
    this.speakingOrder = [];
    this.interventionsByPeer = new Map();

    // Enhanced reference tracking
    this.hansardReferences = [];
    this.peerReferences = new Set();
    this.dateReferences = new Set();
    this.billReferences = new Set();
  }

  extractTimeLimit(content) {
    const timeMatch = content.match(/(\d+)(?:-minute|minutes?|mins?)/i);
    return timeMatch ? parseInt(timeMatch[1]) : null;
  }

  extractPeerageType(speakerName) {
    if (!speakerName) return null;
    
    const peeragePatterns = {
      BARON: /^Lord\s/i,
      BARONESS: /^Baroness\s/i,
      EARL: /^Earl\s/i,
      VISCOUNT: /^Viscount\s/i,
      DUKE: /^Duke\s/i,
      DUCHESS: /^Duchess\s/i,
      MARQUESS: /^Marquess\s/i,
      ARCHBISHOP: /^Archbishop\s/i,
      BISHOP: /^Bishop\s/i
    };

    for (const [type, pattern] of Object.entries(peeragePatterns)) {
      if (pattern.test(speakerName)) {
        return type;
      }
    }

    return null;
  }

  extractPosition(speakerName) {
    if (!speakerName) return null;

    // Common positions in parentheses
    const positionMatch = speakerName.match(/\((.*?)\)/);
    if (positionMatch) {
      return positionMatch[1].trim();
    }

    // Common ministerial titles
    const ministerialPatterns = [
      /Minister(?:\s+of|\s+for)?\s+[^,]+/i,
      /Secretary\s+of\s+State(?:\s+for)?\s+[^,]+/i,
      /Leader\s+of\s+the\s+House(?:\s+of\s+Lords)?/i,
      /Deputy\s+Leader\s+of\s+the\s+House(?:\s+of\s+Lords)?/i,
      /Lord\s+Chancellor/i,
      /Lord\s+Speaker/i,
      /Deputy\s+Speaker/i
    ];

    for (const pattern of ministerialPatterns) {
      const match = speakerName.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }

    return null;
  }

  processSpeech(speech) {
    super.processSpeech(speech);

    // Track timing
    if (speech.time) {
      if (!this.actualStartTime) this.actualStartTime = speech.time;
      this.actualEndTime = speech.time;

      if (speech.content?.includes('time limit')) {
        this.imposedTimeLimits.push({
          time: speech.time,
          limit: this.extractTimeLimit(speech.content)
        });
      }
    }

    // Track speech types
    if (speech.type) {
      const speechData = {
        id: speech.speakerId,
        name: speech.speakerName,
        time: speech.time,
        column: speech.column_number,
        content: speech.content
      };

      switch(speech.type) {
        case 'Start Speech':
          this.speechTypes.mainSpeeches.push(speechData);
          break;
        case 'Start Question':
          this.speechTypes.questions.push(speechData);
          break;
        case 'Start Answer':
          this.speechTypes.answers.push(speechData);
          break;
        case 'Ministerial Statement':
          this.speechTypes.statements.push(speechData);
          break;
        case 'Point of Order':
          this.speechTypes.pointsOfOrder.push(speechData);
          break;
      }
    }

    // Track member details
    if (speech.speakerId && speech.speakerName) {
      if (!this.members.has(speech.speakerId)) {
        this.members.set(speech.speakerId, {
          name: speech.speakerName,
          peerage: this.extractPeerageType(speech.speakerName),
          position: this.extractPosition(speech.speakerName),
          speechCount: 0,
          questionCount: 0,
          answerCount: 0,
          firstContribution: speech.time
        });
        this.speakingOrder.push(speech.speakerId);
      }

      const memberStats = this.members.get(speech.speakerId);
      if (speech.type === 'Start Speech') {
        memberStats.speechCount++;
      } else if (speech.type === 'Start Question') {
        memberStats.questionCount++;
      } else if (speech.type === 'Start Answer') {
        memberStats.answerCount++;
      }
    }

    // Track references
    if (speech.references) {
      if (speech.references.members?.length) {
        speech.references.members.forEach(member => {
          this.peerReferences.add(member);
        });
      }
      if (speech.references.dates?.length) {
        speech.references.dates.forEach(date => {
          this.dateReferences.add(date);
        });
      }
      if (speech.references.bills?.length) {
        speech.references.bills.forEach(bill => {
          this.billReferences.add(bill);
        });
      }
    }

    // Track minister responding
    if (speech.type === 'Start Answer' && 
        (speech.speakerName?.includes('Lord') || speech.speakerName?.includes('Baroness'))) {
      this.ministerResponding = speech.speakerName;
    }

    // Track peers present
    if (speech.speakerId) {
      this.peersPresent.add(speech.speakerId);
    }
  }

  finalize() {
    return {
      ...super.finalize(),
      timing: {
        start: this.actualStartTime,
        end: this.actualEndTime,
        timeLimits: this.imposedTimeLimits
      },
      speechTypes: {
        mainSpeeches: this.speechTypes.mainSpeeches.length,
        questions: this.speechTypes.questions.length,
        answers: this.speechTypes.answers.length,
        statements: this.speechTypes.statements.length,
        pointsOfOrder: this.speechTypes.pointsOfOrder.length
      },
      members: Array.from(this.members.entries()).map(([id, stats]) => ({
        id,
        ...stats
      })),
      speakingOrder: this.speakingOrder,
      references: {
        peers: Array.from(this.peerReferences),
        dates: Array.from(this.dateReferences),
        bills: Array.from(this.billReferences)
      }
    };
  }
}

class LordsQuestionTime extends LordsBusinessSection {
  constructor(metadata = {}) {
    super('LORDS_QUESTIONS', metadata);
    this.questions = [];
    this.currentQuestion = null;
    this.supplementaryQuestions = [];
    this.ministerialResponses = new Map();
    this.speakingOrder = [];
  }

  processSpeech(speech) {
    super.processSpeech(speech);

    if (speech.type === 'Question') {
      this.currentQuestion = {
        id: speech.id,
        text: speech.content,
        askedBy: speech.speakerId,
        time: speech.time,
        supplementaries: [],
        responses: []
      };
      this.questions.push(this.currentQuestion);
    } else if (this.currentQuestion) {
      if (speech.role?.toLowerCase().includes('minister')) {
        this.currentQuestion.responses.push({
          id: speech.id,
          minister: speech.speakerId,
          content: speech.content,
          time: speech.time
        });
      } else {
        this.currentQuestion.supplementaries.push({
          id: speech.id,
          member: speech.speakerId,
          content: speech.content,
          time: speech.time
        });
      }
    }
  }

  finalize() {
    const base = super.finalize();
    return {
      ...base,
      questions: this.questions.map(q => ({
        ...q,
        supplementaries: q.supplementaries || [],
        responses: q.responses || []
      })),
      statistics: {
        totalQuestions: this.questions.length,
        totalSupplementaries: this.questions.reduce((total, q) => 
          total + (q.supplementaries?.length || 0), 0),
        uniqueContributors: Array.from(new Set(
          this.questions.flatMap(q => [
            q.askedBy,
            ...(q.supplementaries || []).map(s => s.member),
            ...(q.responses || []).map(r => r.minister)
          ]).filter(Boolean)
        ))
      }
    };
  }
}

class LordsLegislativeStage extends LordsBusinessSection {
  constructor(type, metadata = {}) {
    super(type, metadata);
    this.motions = [];
    this.amendments = [];
    this.royalPrerogative = false;
  }

  processMotion(node) {
    const motion = {
      text: Array.from(node.getElementsByTagName('p'))
        .filter(p => p.getAttribute('pwmotiontext') === 'yes')
        .map(p => p.textContent),
      mover: node.getAttribute('speakername'),
      status: 'PROPOSED'
    };
    this.motions.push(motion);
  }
}

class LordsParliamentaryProcessor extends ParliamentaryProcessor {
  constructor(config = {}) {
    super(config);
    this.businessTypes = COMBINED_BUSINESS_TYPES;
  }

  determineBusinessType(node) {
    const content = node.textContent.trim().replace(/\s+/g, ' ');
    
    // Use the parent class's matching methods but with our combined types
    for (const [category, typeConfig] of Object.entries(this.businessTypes)) {
      if (typeConfig.markers) {
        if (this.matchesMarkers(content, typeConfig.markers)) {
          return { category, type: null };
        }
      } else {
        for (const [type, config] of Object.entries(typeConfig)) {
          if (this.matchesBusinessType(content, config)) {
            return { category, type };
          }
        }
      }
    }
    
    return { category: 'OTHER', type: null };
  }

  matchesBusinessType(content, config) {
    if (!config) return false;

    // Check direct markers first
    if (config.markers && this.matchesMarkers(content, config.markers)) {
      return true;
    }

    // Then check subtypes if they exist
    if (config.subTypes) {
      for (const subtypeConfig of Object.values(config.subTypes)) {
        if (subtypeConfig.markers && this.matchesMarkers(content, subtypeConfig.markers)) {
          return true;
        }
      }
    }

    return false;
  }

  matchesMarkers(content, markers) {
    if (!markers || !Array.isArray(markers)) return false;
    return markers.some(marker => content.includes(marker));
  }

  createBusinessInstance(type, metadata) {
    switch (type.category) {
      case 'LORDS_QUESTIONS':
        return new LordsQuestionTime(metadata);
      case 'LORDS_LEGISLATION':
        return new LordsLegislativeStage(type, metadata);
      default:
        return new LordsBusinessSection(type, metadata);
    }
  }

  processSpeech(node) {
    const speech = this.extractSpeech(node);
    
    // Handle Lords-specific speech types
    if (speech.content.includes('Royal Assent')) {
      speech.type = 'ROYAL_ASSENT';
    } else if (speech.content.includes('took the oath')) {
      speech.type = 'OATH';
    }

    // Add Lords-specific metadata
    speech.peerage = this.extractPeerageType(speech.speakerName);
    speech.position = this.extractPosition(speech.speakerName);

    if (this.currentBusiness) {
      this.currentBusiness.processSpeech(speech);
    }
  }

  extractPeerageType(name) {
    if (!name) return null;
    if (name.includes('Lord')) return 'BARON';
    if (name.includes('Baroness')) return 'BARONESS';
    if (name.includes('Earl')) return 'EARL';
    if (name.includes('Viscount')) return 'VISCOUNT';
    if (name.includes('Duke')) return 'DUKE';
    return null;
  }

  extractPosition(name) {
    // Extract positions like "Lord Chancellor", "Leader of the House", etc.
    const positions = [
      'Lord Chancellor',
      'Leader of the House',
      'Lord Privy Seal',
      'Lord Speaker'
    ];
    return positions.find(p => name?.includes(p)) || null;
  }
}

module.exports = {
  LordsParliamentaryProcessor,
  LORDS_BUSINESS_TYPES,
  COMBINED_BUSINESS_TYPES,
  LordsQuestionTime,
  LordsLegislativeStage
};