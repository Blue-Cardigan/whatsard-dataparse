const { ParliamentaryBusiness, ParliamentaryProcessor, BUSINESS_TYPES } = require('./parseCommons.cjs');

// Lords-specific business types
const LORDS_BUSINESS_TYPES = {
  QUESTIONS: {
    ORAL: {
      markers: ['Question'],
      precedence: 1
    },
    URGENT: {
      markers: ['Commons Urgent Question', 'Private Notice Question'],
      precedence: 2
    }
  },
  BILLS: {
    FIRST_READING: {
      markers: ['First Reading'],
      precedence: 3
    },
    SECOND_READING: {
      markers: ['Second Reading'],
      precedence: 4
    },
    THIRD_READING: {
      markers: ['Third Reading'],
      precedence: 5
    },
    REPORT: {
      markers: ['Report'],
      precedence: 6
    }
  },
  MOTIONS: {
    APPROVAL: {
      markers: ['Motion to Approve', 'Motions to Approve'],
      precedence: 4
    },
    REGRET: {
      markers: ['Motion to Regret'],
      precedence: 4
    }
  }
};

// Extend base business types
const lordsBusinessTypes = {
  ...LORDS_BUSINESS_TYPES,
  ...BUSINESS_TYPES
};

class LordsBusiness extends ParliamentaryBusiness {
  constructor(type, metadata = {}) {
    super(type, metadata);
    this.questions = [];
    this.divisions = [];
  }

  addQuestion(question) {
    this.questions.push(question);
  }

  addAmendment(amendment) {
    this.amendments.push(amendment);
  }
}

// Add this new utility function
function cleanTitle(title) {
  return title
    // Remove "\n - Question" suffix
    .replace(/\n\s*-\s*Question$/, '')
    // Replace "[HL]" with empty string
    .replace(/\s*\[HL\]/, '')
    // Clean up any double spaces
    .replace(/\s+/g, ' ')
    // Trim any whitespace
    .trim();
}

class LordsDivisionProcessor {
  static processDivision(node) {
    if (node.nodeName !== 'division') return null;
    
    return {
      id: node.getAttribute('id'),
      date: node.getAttribute('divdate'),
      number: node.getAttribute('divnumber'),
      time: node.getAttribute('time'),
      counts: LordsDivisionProcessor.extractCounts(node),
      votes: LordsDivisionProcessor.extractVotes(node)
    };
  }

  static extractCounts(node) {
    for (const child of node.childNodes) {
      if (child.nodeName === 'divisioncount') {
        return {
          content: parseInt(child.getAttribute('content')),
          notContent: parseInt(child.getAttribute('not-content'))
        };
      }
    }
    return {
      content: 0,
      notContent: 0
    };
  }

  static extractVotes(node) {
    const votes = {
      content: [],
      notContent: []
    };

    for (const child of node.childNodes) {
      if (child.nodeName === 'lordlist') {
        const voteType = child.getAttribute('vote');
        for (const lord of child.childNodes) {
          if (lord.nodeName === 'lord') {
            const vote = {
              memberId: lord.getAttribute('person_id'),
              name: lord.textContent.trim()
            };
            
            if (voteType === 'content') {
              votes.content.push(vote);
            } else if (voteType === 'not-content') {
              votes.notContent.push(vote);
            }
          }
        }
      }
    }

    return votes;
  }
}

class LordsProcessor extends ParliamentaryProcessor {
  constructor(config = {}) {
    super(config);
    this.businessTypes = lordsBusinessTypes;
    this.currentQuestion = null;
  }

  // Override the createBusinessInstance method
  createBusinessInstance(type, metadata) {
    // Clean the title if one exists
    if (metadata?.title) {
      metadata.title = cleanTitle(metadata.title);
    }
    
    return new LordsBusiness({
      type: type
    }, metadata);
  }

  processSpeech(node) {
    const speech = this.extractSpeech(node);
    
    // Handle Lords Question patterns
    if (this.currentBusiness?.type.category === 'QUESTIONS') {
      switch(speech.type) {
        case 'Start Question':
          this.currentQuestion = {
            askedBy: speech.speakerName,
            text: speech.content,
            answers: [],
            supplementaries: []
          };
          this.currentBusiness.addQuestion(this.currentQuestion);
          break;
          
        case 'Start Answer':
          if (this.currentQuestion) {
            this.currentQuestion.answers.push({
              answeredBy: speech.speakerName,
              text: speech.content
            });
          }
          break;
          
        default:
          // Handle supplementary questions
          if (this.currentQuestion && speech.type !== 'Start Answer') {
            this.currentQuestion.supplementaries.push({
              speakerName: speech.speakerName,
              text: speech.content
            });
          }
      }
    } else {
      super.processSpeech(node);
    }
  }

  processAmendment(node) {
    if (!this.currentBusiness) return;

    const amendmentMatch = node.textContent.match(/Amendment (\d+)/);
    if (amendmentMatch) {
      const amendment = {
        number: amendmentMatch[1],
        text: node.textContent,
        mover: node.getAttribute('speakername'),
        status: this.determineAmendmentStatus(node)
      };
      this.currentBusiness.addAmendment(amendment);
    }
  }

  determineAmendmentStatus(node) {
    const text = node.textContent.toLowerCase();
    if (text.includes('amendment agreed')) return 'AGREED';
    if (text.includes('amendment withdrawn')) return 'WITHDRAWN';
    if (text.includes('amendment not moved')) return 'NOT_MOVED';
    return 'PROPOSED';
  }

  processDivision(node, context) {
    // Lords implementation uses LordsDivisionProcessor
    const division = LordsDivisionProcessor.processDivision(node);
    
    // Add context information if needed
    if (division && context) {
      division.debate = {
        title: context.title,
        speech_index: context.speech_index
      };
    }
    
    return division;
  }

  // Modify the determineBusinessType method to prioritize Lords business types
  determineBusinessType(node) {
    const content = node.textContent.trim();
    
    // First check Lords-specific business types
    for (const [category, types] of Object.entries(LORDS_BUSINESS_TYPES)) {
      for (const [type, config] of Object.entries(types)) {
        if (config.markers.some(marker => content.includes(marker))) {
          // For Bills, determine the specific reading/stage
          if (category === 'BILLS') {
            return { 
              category: 'BILLS', 
              type: type // Will be FIRST_READING, SECOND_READING etc.
            };
          }
          return { category, type };
        }
      }
    }

    // If no Lords-specific type found, fall back to Commons types
    return super.determineBusinessType(node);
  }

  processMinorHeading(node) {
    const content = node.textContent.trim();
    
    // Check if this is an amendment heading
    if (content.toLowerCase().includes('amendment')) {
      if (this.currentBusiness) {
        const speech = {
          speakerId: null,
          speakerName: null,
          time: node.getAttribute('time'),
          type: content, // Store the amendment number as the type
          content: '',
          extracts: [],
          procedural: false,
          colnum: node.getAttribute('colnum')
        };
        
        this.currentBusiness.addSpeech(speech);
      }
    } else {
      // Handle other minor headings normally
      super.processMinorHeading(node);
    }
  }
}

module.exports = {
  LordsBusiness,
  LordsProcessor,
  LordsDivisionProcessor,
  LORDS_BUSINESS_TYPES
};