// Constants and types
const BUSINESS_TYPES = {
  STATEMENTS: {
    SPEAKER: {
      markers: ["Speaker's Statement"],
      precedence: 1
    },
    MINISTERIAL: {
      markers: ['Statement'],
      precedence: 3
    }
  },
  PROCEDURAL: {
    STANDING_ORDERS: {
      markers: ['Standing Order No.'],
      precedence: 1
    },
    POINTS_OF_ORDER: {
      markers: ['Order'],
      precedence: 2
    }
  },
  DEBATES: {
    MAIN: {
      markers: ['Motion', 'Debate', 'Ways and Means'],
      precedence: 6
    },
    ADJOURNMENT: {
      markers: ['Adjournment'],
      precedence: 7
    }
  },
}

const COMMONS_BUSINESS_TYPES = {
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
        }
      }
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
    }
  },
  BUSINESS_WITHOUT_DEBATE: {
    DELEGATED_LEGISLATION: {
      markers: ['Delegated Legislation'],
      precedence: 6
    },
    OTHER: {
      markers: ['Business without Debate'],
      precedence: 6
    }
  }
};

const businessTypes = {
  ...COMMONS_BUSINESS_TYPES,
  ...BUSINESS_TYPES
};

// Core classes
class ParliamentaryContext {
  constructor(processor) {
    this.processor = processor;
    this.currentBusiness = null;
    this.procedural = new ProceduralContext(processor);
    this.timing = new TimingContext();
    this.speakers = new Set();
    this.currentDebate = {
      title: null,
      type: null,
      subheadings: [],
      divisions: []
    };
  }

  updateContext(node) {
    this.procedural.updateContext(node);
    this.timing.updateContext(node);
    this.updateDebateContext(node);
  }

  updateDebateContext(node) {
    switch(node.nodeName) {
      case 'major-heading':
        this.currentDebate.title = node.textContent.trim();
        break;
      case 'minor-heading':
        this.currentDebate.subheadings.push({
          id: node.getAttribute('id'),
          text: node.textContent.trim(),
          time: node.getAttribute('time')
        });
        break;
    }
  }
}
class ProceduralContext {
  constructor(processor) {
    this.processor = processor;
    this.currentStandingOrder = null;
    this.votingStatus = null;
    this.amendments = [];
    this.divisions = [];
  }

  updateContext(node) {
    this.updateStandingOrder(node);
    this.updateVotingStatus(node);
    this.processAmendments(node);
  }

  updateStandingOrder(node) {
    const standingOrderMatch = node.textContent.match(/Standing Order No\. (\d+)/);
    if (standingOrderMatch) {
      this.currentStandingOrder = standingOrderMatch[1];
    }
  }

  updateVotingStatus(node) {
    if (node.nodeName === 'division') {
      this.votingStatus = 'DIVISION';
      const division = this.processor.processDivision(node, {
        title: this.processor.currentBusiness?.metadata?.title || null,
        speech_index: this.processor.currentBusiness?.speech_index || null
      });
      if (division) {
        this.divisions.push(division);
      }
    }
  }

  processAmendments(node) {
    if (node.nodeType !== 1) return;  // Skip if not element node
    
    if (node.textContent.includes('Amendment proposed:')) {
      const amendment = {
        time: node.getAttribute('time'),
        text: node.textContent.trim(),
        status: 'PROPOSED'
      };
      this.amendments.push(amendment);
    } else if (node.textContent.includes('Amendment withdrawn')) {
      if (this.amendments.length > 0) {
        this.amendments[this.amendments.length - 1].status = 'WITHDRAWN';
      }
    } else if (node.textContent.includes('Amendment agreed to')) {
      if (this.amendments.length > 0) {
        this.amendments[this.amendments.length - 1].status = 'AGREED';
      }
    }
  }
}
class TimingContext {
  constructor() {
    this.currentTime = null;
    this.sessionDate = null;
    this.previousTime = null;
  }

  updateContext(node) {
    if (node.nodeType === 1) {  // 1 = ELEMENT_NODE
      const time = node.getAttribute('time');
      if (time) {
        this.previousTime = this.currentTime;
        this.currentTime = time;
      }
    }
  }

  getDuration() {
    if (this.previousTime && this.currentTime) {
      return this.calculateDuration(this.previousTime, this.currentTime);
    }
    return null;
  }

  calculateDuration(start, end) {
    const startTime = new Date(`1970-01-01T${start}`);
    const endTime = new Date(`1970-01-01T${end}`);
    return (endTime - startTime) / 1000 / 60; // Duration in minutes
  }
}

class ParliamentaryBusiness {
  constructor(type, metadata = {}) {
    this.type = type;
    this.metadata = metadata;
    this.procedural = [];
    this.references = [];
    this.speeches = [];
    this.speech_index = 0; // Add speech index counter
  }

  addSpeech(speech) {
    // Add index to speech before pushing
    this.speeches.push({
      ...speech,
      index: this.speech_index++
    });
  }
}

// Main processor class
class ParliamentaryProcessor {
  constructor(config = {}) {
    this.config = config;
    this.context = new ParliamentaryContext(this);
    this.currentBusiness = null;
    this.allBusiness = [];
    this.inOralQuestions = false;
    this.metadata = {
      royalAssent: []  // Add this to store Royal Assent bills
    };
  }

  process(xmlDoc) {
    try {
      this.validateDocument(xmlDoc);
      this.processNode(xmlDoc.documentElement);
      return this.finalizeProcessing();
    } catch (error) {
      this.handleError(error);
    }
  }


  validateDocument(xmlDoc) {
    if (!xmlDoc || !xmlDoc.documentElement) {
      throw new Error('Invalid XML document');
    }
  }

  processNode(node) {
    this.context.updateContext(node);

    // First check for supermajor heading start
    if (node.nodeName === 'major-heading' || node.nodeName === 'oral-heading') {
      const supermajorHeading = this.supermajorHeadingStart(node);
      if (supermajorHeading) {
        this.currentSupermajorHeading = supermajorHeading;
      }
    }

    switch (node.nodeName) {
      case 'oral-heading':
        this.processOralHeading(node);
        break;
      case 'major-heading':
        this.processMajorHeading(node);
        break;
      case 'minor-heading':
        this.processMinorHeading(node);
        break;
      case 'speech':
        this.processSpeech(node);
        break;
    }

    // Process child nodes
    if (node.childNodes) {
      Array.from(node.childNodes).forEach(child => this.processNode(child));
    }
  }

  processOralHeading(node) {
    this.finalizeCurrentBusiness();
    this.inOralQuestions = true;
    
    // Create new business instance for oral questions
    this.currentBusiness = new ParliamentaryBusiness({
      category: 'ORAL_QUESTIONS',
      type: 'DEPARTMENTAL'
    }, {
      id: node.getAttribute('id'),
      title: node.textContent.trim(),
      departments: [], // Initialize empty departments array
      supermajorHeading: []
    });
  }

  isOralQuestionsDepartment(content) {
    const departments = [
      'Home Department',
      'Treasury',
      'Foreign Office',
      'Defence',
      'Health',
      'Education',
      'Work and Pensions',
      'Business and Trade',
      'Transport',
      'Environment, Food and Rural Affairs'
    ];
    
    return departments.some(dept => 
      content.includes(dept) || 
      content.includes('Secretary of State for')
    );
  }


  processMajorHeading(node) {
    const content = node.textContent.trim();
    
    // Add Royal Assent check
    if (content === 'Royal Assent') {
      this.finalizeCurrentBusiness();
      const type = { category: 'PROCEDURAL', type: 'ROYAL_ASSENT' };
      this.currentBusiness = this.createBusinessInstance(type, {
        id: node.getAttribute('id'),
        title: content,
        supermajorHeading: [this.currentSupermajorHeading],
        royalAssentBills: [] // Initialize empty array for bills
      });
      
      // Find the following speech node and process Royal Assent bills
      let nextNode = node.nextSibling;
      while (nextNode && nextNode.nodeType !== 1) {
        nextNode = nextNode.nextSibling;
      }

      if (nextNode && nextNode.nodeName === 'speech') {
        const bills = [];
        
        // Process each paragraph in the speech
        for (const child of nextNode.childNodes) {
          if (child.nodeName === 'p') {
            const text = child.textContent.trim();
            
            // Skip notification paragraphs
            if (text.includes('Royal Assent Act') || 
                text.includes('following Acts were given') ||
                text.includes('I have to notify')) {
              continue;
            }
            
            // Remove trailing comma and clean up text
            const cleanedText = text.replace(/,\s*$/, '').trim();
            
            // Only add if there's actual content
            if (cleanedText) {
              bills.push({
                name: cleanedText,
                time: node.getAttribute('time') || null
              });
            }
          }
        }

        // Add bills to both business metadata and global metadata
        this.currentBusiness.metadata.royalAssentBills = bills;
        this.metadata.royalAssent.push(...bills);
      }
      
      return;
    }
    
    if (this.inOralQuestions) {
      if (!content.includes('was asked—') && !this.isOralQuestionsDepartment(content)) {
        this.inOralQuestions = false;
        this.finalizeCurrentBusiness();
        
        const type = this.determineBusinessType(node);
        this.currentBusiness = new ParliamentaryBusiness(type, {
          id: node.getAttribute('id'),
          title: content,
          supermajorHeading: [this.currentSupermajorHeading]
        });
      } else if (this.currentBusiness) {
        const departmentMeta = {
          name: content,
          id: node.getAttribute('id'),
          minister: null,
          topics: []
        };
        
        const department = {
          ...departmentMeta,
          currentTopic: null,
          questions: [],
          currentGroup: null
        };

        this.currentBusiness.metadata.departments.push(departmentMeta);
        this.currentBusiness.currentDepartment = department;
      }
      return;
    }

    // If we have a current supermajor heading, create new business with it
    if (this.currentSupermajorHeading) {
      this.finalizeCurrentBusiness();
      const type = this.determineBusinessType(node);
      this.currentBusiness = this.createBusinessInstance(type, {
        id: node.getAttribute('id'),
        title: content,
        supermajorHeading: [this.currentSupermajorHeading]
      });
      
      // Clear supermajor heading if this isn't part of a continuing section
      // if (!this.isPartOfSupermajorSection(content)) {
      //   this.currentSupermajorHeading = null;
      // }
      return;
    }

    const supermajorHeading = this.supermajorHeadingStart(node);
    
    if (supermajorHeading) {
      this.inSupermajorSection = true;
      this.finalizeCurrentBusiness();
      const type = this.determineBusinessType(node);
      this.currentBusiness = this.createBusinessInstance(type, {
        id: node.getAttribute('id'),
        title: content,
        supermajorHeading: [supermajorHeading]
      });
    } else {
      // Regular major heading processing
      const type = this.determineBusinessType(node);
      if (this.shouldCreateNewBusiness(type, content)) {
        this.finalizeCurrentBusiness();
        this.currentBusiness = this.createBusinessInstance(type, {
          id: node.getAttribute('id'),
          title: content,
          // regular heading
          supermajorHeading: [supermajorHeading]
        });
      } else if (this.currentBusiness) {
        this.currentBusiness.metadata.subtitle = content;
      }
    }
  }

  supermajorHeadingStart(node) {
    // Get parent's children as an array
    const siblings = Array.from(node.parentNode.childNodes);
    const currentIndex = siblings.indexOf(node);
    
    // Helper to get next element node
    const getNextElement = (startIndex) => {
      for (let i = startIndex + 1; i < siblings.length; i++) {
        if (siblings[i].nodeType === 1) { // ELEMENT_NODE = 1
          return siblings[i];
        }
      }
      return null;
    };
    
    const nextNode = getNextElement(currentIndex);
    const nextNextNode = nextNode ? getNextElement(siblings.indexOf(nextNode)) : null;
    const content = node.textContent.trim();

    // First check if this is an oral-heading
    if (node.nodeName === 'oral-heading' &&
      nextNode?.nodeName === 'major-heading') {
      return content;
    }

    if (content.includes('Bills Presented')) {
      return 'Bills Presented';
    }
    
    // Check for Ways and Means pattern
    const isSandwichPattern = (
      nextNode?.nodeName === 'minor-heading' &&
      nextNextNode?.nodeName === 'major-heading' &&
      node.getAttribute('time') === nextNode.getAttribute('time') &&
      node.getAttribute('time') === nextNextNode.getAttribute('time')
    );

    // Check for Business without Debate pattern
    const isDoubleMajorHeading = (
      nextNode?.nodeName === 'major-heading' &&
      node.getAttribute('time') === nextNode.getAttribute('time')
    );

    // Check for known supermajor content
    const knownTypes = {
      'Ways and Means': 'Ways and Means',
      'Business without Debate': 'Business without Debate',
      'Oral Answers to Questions': 'Oral Answers to Questions'
    };

    for (const [marker, heading] of Object.entries(knownTypes)) {
      if (content.includes(marker)) {
        return heading;
      }
    }

    // If any pattern matches but no specific heading was found, return the content
    if (isSandwichPattern || isDoubleMajorHeading) {
      return content;
    }

    return null;
  }

  determineBusinessType(node) {
    const content = node.textContent.trim();
    const siblings = Array.from(node.parentNode.childNodes);
    const currentIndex = siblings.indexOf(node);
    // Helper to get next element node
    const getNextElement = (startIndex) => {
      for (let i = startIndex + 1; i < siblings.length; i++) {
        if (siblings[i].nodeType === 1) { // ELEMENT_NODE = 1
          return siblings[i];
        }
      }
      return null;
    };
    
    const nextNode = getNextElement(currentIndex);
    
    if (content.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*:\s+[A-Z][a-z]/)) {
      return {
        category: 'MINISTERIAL_STATEMENTS',
        type: 'STATEMENT'
      };
    }

    if (/\w+\s*\(.*\)/.test(content)) {
      return { category: 'LEGISLATION', type: 'BILLS' };
    }

    if (content.includes('Prime Minister')) {
      return {
        category: 'PMQs',
        type: 'ORAL_QUESTIONS'
      };
    }

    if (nextNode?.textContent.includes('Urgent Question')) {
      return {
        category: 'ORAL_QUESTIONS',
        type: 'URGENT'
      };
    }

    if (content.includes('- Question')) {
      return {
        category: 'LORDS_QUESTIONS',
        type: 'QUESTIONS'
      };
    }

    if (this.inOralQuestions && !content.includes('was asked—') && 
        !content.includes('Oral Answers')) {
      this.inOralQuestions = false;
    }

    for (const [category, types] of Object.entries(businessTypes)) {
      for (const [type, config] of Object.entries(types)) {
        if (config.requiresAllMarkers) {
          if (config.markers.every(marker => content.includes(marker))) {
            return { category, type };
          }
          continue;
        }

        if (config.markers.some(marker => content.includes(marker))) {
          if (category === 'ORAL_QUESTIONS' && config.subTypes) {
            for (const [subConfig] of Object.entries(config.subTypes)) {
              if (subConfig.markers.some(marker => content.includes(marker))) {
                return { 
                  category, 
                  type
                };
              }
            }
          }
          return { category, type };
        }

        if (config.subTypes) {
          for (const [subType, subConfig] of Object.entries(config.subTypes)) {
            if (subConfig.markers.some(marker => content.includes(marker))) {
              return { 
                category, 
                type,
                subType 
              };
            }
          }
        }
      }
    }

    // Add safety check before splitting
    if (!content.includes('- ')) {
      return { category: 'OTHER', type: content.replace(/\s+/g, '_').toUpperCase() };
    }
    
    return { category: 'OTHER', type: `${content.split('- ')[1].replace(/\s+/g, '_').toUpperCase()}` };
  }

  processMinorHeading(node) {
    const content = node.textContent.trim();
    
    if (this.inOralQuestions && this.currentBusiness?.currentDepartment) {
      const topic = {
        id: node.getAttribute('id'),
        text: content,
        questions: []
      };

      this.currentBusiness.currentDepartment.topics.push(topic);
      this.currentBusiness.currentDepartment.currentTopic = topic;
    } else if (this.currentBusiness) {
      this.currentBusiness.metadata.minorHeadings = 
        this.currentBusiness.metadata.minorHeadings || [];
      this.currentBusiness.metadata.minorHeadings.push({
        id: node.getAttribute('id'),
        text: content,
        first_speech_index: this.currentBusiness.speech_index || 0
      });
    }
  }

  processSpeech(node) {
    if (!this.currentBusiness) return;

    const speech = this.extractSpeech(node);
    
    if (this.inOralQuestions) {
      this.processOralQuestionSpeech(speech);
    } else {
      this.currentBusiness.addSpeech(speech);
    }

    if (speech.speakerId) {
      this.context.speakers.add(speech.speakerId);
    }
  }

  extractSpeech(node) {
    const billStage = this.extractBillStage(node);
    const motionStatus = this.extractMotionStatus(node);
    
    return {
      speakerId: node.getAttribute('person_id'),
      speakerName: node.getAttribute('speakername'),
      time: node.getAttribute('time'),
      type: node.getAttribute('type'),
      content: this.extractSpeechContent(node),
      extracts: this.extractSpeechExtracts(node),
      procedural: this.isProceduralSpeech(node),
      debateRole: this.extractDebateRole(node),
      motion: motionStatus,
      colnum: node.getAttribute('colnum'),
      oral_qnum: node.getAttribute('oral-qnum'),
      bill_stage: billStage
    };
  }

  extractMotionStatus(node) {
    const content = node.textContent.trim();
    
    // Motion status patterns
    const patterns = {
      MOTION_PROPOSED: [
        /^Motion made, and Question proposed/,
        /^Motion proposed/,
        /^I beg to move/
      ],
      MOTION_PUT_FORTHWITH: [
        /^Motion made, and Question put forthwith/,
        /^Question put forthwith/
      ],
      MOTION_AGREED: [
        /^Question (?:accordingly )?agreed to(?:,)?/,
        /^Motion (?:accordingly )?agreed to(?:,)?/,
        /^Resolved(?:,)?/,
        /^Ordered(?:,)?/
      ],
      MOTION_WITHDRAWN: [
        /^Motion, by leave, withdrawn(?:,)?/,
        /^Motion withdrawn(?:,)?/,
        /^By leave, withdrawn(?:,)?/
      ],
      MOTION_NEGATIVED: [
        /^Question negatived(?:,)?/,
        /^Motion negatived(?:,)?/
      ],
      DIVISION_OUTCOME: [
        /^The House divided/,
        /^Division No\. \d+/
      ],
      BILL_PRESENTATION: [
        /^Bill (?:presented|brought up)/,
        /^(?:.*?) presented a Bill/,
        /^Presentation Bill/
      ],
      BILL_READING: [
        /^Bill read(?: the)? (?:First|Second|Third) time(?:,)?/,
        /^(?:.*?) read(?: the)? (?:First|Second|Third) time(?:,)?/
      ]
    };

    // Collect all matching statuses
    const statuses = [];
    for (const [status, statusPatterns] of Object.entries(patterns)) {
      if (statusPatterns.some(pattern => pattern.test(content))) {
        statuses.push(status);
      }
    }

    // Return array of statuses, or null if none found
    return statuses.length > 0 ? statuses : null;
  }

  extractBillStage(node) {
    const content = node.textContent;
    
    // Common bill stage patterns
    const stagePatterns = {
      FIRST_READING: [
        /Bill read (?:the )?First time/i,
        /First Reading/i,
        /presented a Bill/i,
        /Bill presented/i,
        /read a first time/i
      ],
      SECOND_READING: [
        /Bill read (?:the )?Second time/i,
        /read a second time/i,
        /Second Reading/i
      ],
      THIRD_READING: [
        /Bill read (?:the )?Third time/i,
        /read a third time/i,
        /Third Reading/i
      ],
      COMMITTEE: [
        /Committee stage/i,
        /in Committee/i
      ],
      REPORT: [
        /Report stage/i,
        /Bill reported/i
      ],
      CONSIDERATION: [
        /Consideration of Bill/i,
        /Bill considered/i
      ],
      ROYAL_ASSENT: [
        /Royal Assent/i
      ]
    };

    // Check each pattern
    for (const [stage, patterns] of Object.entries(stagePatterns)) {
      if (patterns.some(pattern => pattern.test(content))) {
        return stage;
      }
    }

    return null;
  }

  extractDebateRole(node) {
    // Get previous sibling, skipping text nodes
    const getPreviousElement = (node) => {
      let previous = node.previousSibling;
      while (previous && previous.nodeType !== 1) { // ELEMENT_NODE = 1
        previous = previous.previousSibling;
      }
      return previous;
    };

    // Check current node and previous element
    const checkForRole = (content) => {
      // Don't extract role if this is the calling node
      if (content.startsWith('I call')) {
        return null;
      }

      // Check previous node for role patterns
      const previousElement = getPreviousElement(node);
      if (!previousElement?.textContent) return null;

      // Pattern 1: "I call the [role] (name)" or "I call the [role], name"
      const rolePattern = /I call the ([^,\(]+?)(?:,|\s+\(|$)/;
      const match = previousElement.textContent.match(rolePattern);
      if (match) {
        return match[1].trim();
      }

      // Pattern 2: "I call [Name] [Name] (2-3 capitalized words)"
      const namePattern = /I call (?!the\b)([A-Z][a-z]+(?: [A-Z][a-z]+){1,2})/;
      const nameMatch = previousElement.textContent.match(namePattern);
      if (nameMatch) {
        return 'Called to Speak';
      }

      // Pattern 3: Special cases like maiden speeches
      const maidenPattern = /I call (.*?) to make (?:his|her) maiden speech/;
      const maidenMatch = previousElement.textContent.match(maidenPattern);
      if (maidenMatch) {
        return maidenMatch[1].trim();
      }

      return null;
    };

    return checkForRole(node.textContent);
  }

  extractSpeechContent(node) {
    let content = '';
    for (const child of node.childNodes) {
      if (child.nodeName !== 'speech') {
        content += child.textContent;
      }
    }
    return content.trim();
  }

  extractSpeechExtracts(node) {
    const extracts = [];
    for (const child of node.childNodes) {
      if (child.nodeName === 'p') {
        const matches = child.textContent.match(/\[([^\]]+)\]/g);
        if (matches) {
          matches.forEach(match => extracts.push(match.slice(1, -1).trim()));
        }
        // Identify standing orders
        const phrases = child.getElementsByTagName('phrase');
        for (const phrase of phrases) {
          if (phrase.getAttribute('class') === 'standing-order') {
            extracts.push(phrase.textContent.trim());
          }
        }
      }
    }
    return extracts;
  }

  isProceduralSpeech(node) {
    if (node.getAttribute('nospeaker') === 'true') {
      return true;
    }

    const proceduralPatterns = [
      // Motion and Question patterns
      /^Motion made/,
      /^Question (?:put|agreed to)/,
      
      // Division patterns
      /^Division No\. \d+/,
      /^The House (?:divided)/,
      
      // Amendment patterns
      /^Amendment (?:proposed|withdrawn|agreed to)/,
      
      // Order patterns
      /^Order(?:!|\.)/,
      /Standing Order No\. \d+/,
      
      // Bill patterns
      /^Bill (?:presented|read|ordered to be|brought up)/,
      /^(?:.*?) presented a Bill/,
      /(?:ordered )?to be (?:printed|read)/,
      
      // General procedural patterns
      /^Ordered(?:,)?/,
      /^laid before/,
      /^brought up and read/,
      
      // Speaker call patterns
      /^I call the/,
      /^I call [A-Z][a-zA-Z]* [A-Z][a-zA-Z]*/,

    ];

    const content = node.textContent.trim();
    return proceduralPatterns.some(pattern => pattern.test(content));
  }

  processDivision(node, context) {
    // Base implementation uses DivisionProcessor
    return DivisionProcessor.processDivision(node, context);
  }

  shouldCreateNewBusiness(type, content) {
    if (this.inOralQuestions && !content.includes('was asked—')) {
      return true;
    }

    if (this.inSupermajorSection) {
      // Only create new business if we hit another supermajor heading start
      return this.supermajorHeadingStart(node);
    }

    if (!this.currentBusiness) return true;
    
    if (type.category !== this.currentBusiness.type.category) {
      return true;
    }

    return false;
  }

  createBusinessInstance(type, metadata) {
    return new ParliamentaryBusiness({
      type: type
    }, {
      ...metadata,
      speaker: null,
      deputySpeaker: null,
      divisions: [],
    });
  }

  finalizeCurrentBusiness() {
    if (this.currentBusiness) {
      if (this.context.procedural.divisions.length > 0) {
        this.currentBusiness.divisions = [...this.context.procedural.divisions];
      }
      if (this.context.procedural.amendments.length > 0) {
        this.currentBusiness.amendments = [...this.context.procedural.amendments];
      }

      this.allBusiness.push(this.currentBusiness);
      this.currentBusiness = null;
      
      this.context.procedural = new ProceduralContext(this);
    }
  }

  finalizeProcessing() {
    this.finalizeCurrentBusiness();
    return {
      business: this.allBusiness,
      metadata: {
        totalSpeeches: this.countTotalSpeeches(),
        uniqueSpeakers: this.context.speakers.size,
        duration: this.context.timing.getDuration(),
        divisions: this.context.procedural.divisionProcessor?.getDivisionStats() || []
      }
    };
  }

  handleError(error) {
    console.error('Error processing parliamentary business:', error);
    throw error;
  }

  countTotalSpeeches() {
    return this.allBusiness.reduce((total, business) => {
      if (business instanceof QuestionTimeSection) {
        // Count speeches in current department
        const deptSpeeches = business.currentDepartment?.questions.reduce((deptTotal, group) => {
          let count = 1; // Main question
          count += group.answers?.length || 0;
          
          count += group.supplementaries?.reduce((suppTotal, supp) => {
            return suppTotal + (supp.question ? 1 : 0) + (supp.answer ? 1 : 0);
          }, 0) || 0;
          
          return deptTotal + count;
        }, 0) || 0;

        return total + deptSpeeches;
      } else {
        // Regular business speeches
        return total + (business.speeches?.length || 0);
      }
    }, 0);
  }

  processOralQuestionSpeech(speech) {
    if (!this.currentBusiness?.currentDepartment) return;

    const department = this.currentBusiness.currentDepartment;
    
    // Handle question numbers
    if (speech.oral_qnum) {
      // Start a new question group
      department.currentGroup = {
        number: speech.oral_qnum,
        mainQuestion: speech,
        answers: [],
        supplementaries: []
      };
      department.questions.push(department.currentGroup);
    } else if (department.currentGroup) {
      // Check if this is an answer or supplementary
      if (this.isMinisterSpeech(speech)) {
        if (department.currentGroup.answers.length === 0) {
          // This is the main answer
          department.currentGroup.answers.push(speech);
        } else {
          // This is a supplementary answer
          if (department.currentGroup.supplementaries.length === 0 ||
              department.currentGroup.supplementaries[department.currentGroup.supplementaries.length - 1].answer) {
            // Start new supplementary pair
            department.currentGroup.supplementaries.push({ question: null, answer: speech });
          } else {
            // Complete current supplementary pair
            department.currentGroup.supplementaries[department.currentGroup.supplementaries.length - 1].answer = speech;
          }
        }
      } else {
        // This is a supplementary question
        if (department.currentGroup.supplementaries.length === 0 ||
            department.currentGroup.supplementaries[department.currentGroup.supplementaries.length - 1].answer) {
          // Start new supplementary pair
          department.currentGroup.supplementaries.push({ question: speech, answer: null });
        } else {
          // Update current supplementary question
          department.currentGroup.supplementaries[department.currentGroup.supplementaries.length - 1].question = speech;
        }
      }
    }

    // Add to general speeches collection
    this.currentBusiness.addSpeech(speech);
  }

  isMinisterSpeech(speech) {
    // Implement your logic to determine if a speech is a minister's speech here
    // For example, you can check the speaker's name or any other criteria
    return false;
  }

  processRoyalAssent(node) {
    // Find the following speech node
    let nextNode = node.nextSibling;
    while (nextNode && nextNode.nodeType !== 1) {
      nextNode = nextNode.nextSibling;
    }

    if (nextNode && nextNode.nodeName === 'speech') {
      const bills = [];
      
      // Process each paragraph in the speech
      for (const child of nextNode.childNodes) {
        if (child.nodeName === 'p') {
          const text = child.textContent.trim();
          
          // Skip notification paragraphs
          if (text.includes('Royal Assent Act') || 
              text.includes('following Acts were given') ||
              text.includes('I have to notify')) {
            continue;
          }
          
          // Remove trailing comma and clean up text
          const cleanedText = text.replace(/,\s*$/, '').trim();
          
          // Only add if there's actual content
          if (cleanedText) {
            bills.push({
              name: cleanedText,
              time: node.getAttribute('time') || null
            });
          }
        }
      }

      // Add bills to metadata
      this.metadata.royalAssent.push(...bills);
    }
  }

  isPartOfSupermajorSection(content) {
    // Helper to determine if this heading is part of an ongoing supermajor section
    return content.includes('Ways and Means') ||
           content.includes('Budget Resolutions') ||
           content.includes('Business without Debate') ||
           content.includes('Delegated Legislation');
  }
}

// Enhance QuestionTimeSection to better handle departmental info
class QuestionTimeSection extends ParliamentaryBusiness {
  constructor(type, metadata = {}) {
    super(type, metadata);
    this.currentDepartment = null;
    this.metadata.departments = [];
    this.speeches = [];
    this.speech_index = 0; // Add speech index counter
  }
}

class DivisionProcessor {
  static processDivision(node, { title = null, speech_index = null } = {}) {
    if (node.nodeName !== 'division') return null;
    return {
      id: node.getAttribute('id'),
      date: node.getAttribute('divdate'),
      number: node.getAttribute('divnumber'),
      time: node.getAttribute('time'),
      counts: DivisionProcessor.extractCounts(node),
      votes: DivisionProcessor.extractVotes(node),
      outcome: DivisionProcessor.extractOutcome(node),
      debate: {
        title: title,
        speech_index: speech_index
      }
    };
  }

  static extractCounts(node) {
    for (const child of node.childNodes) {
      if (child.nodeName === 'divisioncount') {
        return {
          ayes: parseInt(child.getAttribute('ayes')),
          noes: parseInt(child.getAttribute('noes'))
        };
      }
    }
    return null;
  }

  static extractVotes(node) {
    const votes = {
      ayes: [],
      noes: [],
      tellers: { ayes: [], noes: [] }
    };

    for (const child of node.childNodes) {
      if (child.nodeName === 'mplist') {
        const voteType = child.getAttribute('vote');
        const voteKey = voteType === 'aye' ? 'ayes' : 
                       voteType === 'no' ? 'noes' : null;
                       
        if (!voteKey) continue;

        for (const mp of child.childNodes) {
          if (mp.nodeName === 'mpname') {
            const vote = {
              memberId: mp.getAttribute('person_id'),
              name: mp.textContent.trim(),
              proxy: mp.getAttribute('proxy')
            };
            
            const isTeller = mp.getAttribute('teller') === 'yes';
            if (isTeller) {
              votes.tellers[voteKey].push(vote);
            } else {
              votes[voteKey].push(vote);
            }
          }
        }
      }
    }

    return votes;
  }

  static extractOutcome(node) {
    const counts = DivisionProcessor.extractCounts(node);
    if (!counts) return null;

    return {
      result: counts.ayes > counts.noes ? 'AGREED' : 'NEGATIVED',
      majority: Math.abs(counts.ayes - counts.noes),
      tied: counts.ayes === counts.noes
    };
  }
}
module.exports = {
  ParliamentaryBusiness,
  QuestionTimeSection,
  ParliamentaryProcessor,
  ParliamentaryContext,
  BUSINESS_TYPES  
};

