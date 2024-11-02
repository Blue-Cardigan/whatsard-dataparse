// Constants and types
const BUSINESS_TYPES = {
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
  STATEMENTS: {
    MINISTERIAL: {
      markers: ['Statement'],
      precedence: 3
    },
    URGENT: {
      markers: ['(Urgent Question):'],
      precedence: 3
    },
    SPEAKER: {
      markers: ["Speaker's Statement"],
      precedence: 1
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
    },
    WESTMINSTER_HALL: {
      markers: ['Westminster Hall'],
      precedence: 8
    }
  }
};

// Core classes
class ParliamentaryContext {
  constructor() {
    this.speakers = new Set();
    this.timing = new TimingContext();
    this.procedural = new ProceduralContext();
  }

  updateContext(node) {
    this.timing.updateContext(node);
    this.procedural.updateContext(node);
    
    if (node.nodeType === 1) {  // ELEMENT_NODE
      const speakerId = node.getAttribute('person_id');
      if (speakerId) {
        this.speakers.add(speakerId);
      }
    }
  }
}

class ProceduralContext {
  constructor() {
    this.currentStandingOrder = null;
    this.motionStatus = null;
    this.votingStatus = null;
    this.amendments = [];
    this.divisions = [];
  }

  updateContext(node) {
    this.updateStandingOrder(node);
    this.updateMotionStatus(node);
    this.updateVotingStatus(node);
    this.processAmendments(node);
  }

  updateStandingOrder(node) {
    const standingOrderMatch = node.textContent.match(/Standing Order No\. (\d+)/);
    if (standingOrderMatch) {
      this.currentStandingOrder = standingOrderMatch[1];
    }
  }

  updateMotionStatus(node) {
    if (node.textContent.includes('Motion made')) {
      this.motionStatus = 'PROPOSED';
    } else if (node.textContent.includes('Question put')) {
      this.motionStatus = 'VOTING';
    } else if (node.textContent.includes('Question agreed to')) {
      this.motionStatus = 'AGREED';
    }
  }

  updateVotingStatus(node) {
    if (node.textContent.includes('Division')) {
      this.votingStatus = 'DIVISION';
      this.processDivision(node);
    }
  }

  processDivision(node) {
    if (node.nodeType !== 1) return;  // Skip if not element node
    
    const division = {
      time: node.getAttribute('time'),
      ayes: extractAyes(node),
      noes: extractNoes(node)
    };
    this.divisions.push(division);
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
      return calculateDuration(this.previousTime, this.currentTime);
    }
    return null;
  }
}

class ParliamentaryBusiness {
  constructor(type, metadata = {}) {
    this.type = type;
    this.metadata = metadata;
    this.speeches = [];
    this.children = [];
    this.parent = null;
    this.procedural = [];
    this.references = [];
  }

  processSpeech(speech) {
    this.addSpeech(speech);
    
    // Track procedural speeches
    if (speech.procedural) {
      this.procedural.push(speech);
    }

    // Track references - ensure it's an array before spreading
    if (speech.references && Array.isArray(speech.references)) {
      this.references.push(...speech.references);
    } else if (speech.references) {
      // If references exist but aren't an array, handle the object structure
      if (speech.references.dates) {
        this.references.push(...speech.references.dates);
      }
      if (speech.references.members) {
        this.references.push(...speech.references.members);
      }
      if (speech.references.standingOrders) {
        this.references.push(...speech.references.standingOrders);
      }
    }
  }

  addSpeech(speech) {
    this.speeches.push(speech);
  }

  addChild(child) {
    this.children.push(child);
    child.parent = this;
  }

  getFullHierarchy() {
    const hierarchy = [this];
    let current = this;
    while (current.parent) {
      hierarchy.unshift(current.parent);
      current = current.parent;
    }
    return hierarchy;
  }
}

// Add the new SpeechGroup class
class SpeechGroup {
  constructor(type) {
    this.type = type;
    this.initialQuestion = null;
    this.ministerAnswer = null;
    this.supplementaries = [];
    this.procedurals = [];
    this.startTime = null;
    this.endTime = null;
  }

  addSpeech(speech) {
    switch(speech.type) {
      case 'Start Question':
        this.initialQuestion = speech;
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

// Add the new QuestionTimeSection class
class QuestionTimeSection extends ParliamentaryBusiness {
    constructor(type, metadata = {}) {
        super(type, metadata);
        this.department = type.department;
        this.minister = metadata.minister;
        this.questionGroups = [];
        this.currentGroup = null;
        this.topicalQuestions = false;
    
        // Track grouped questions
        this.groupedQuestions = new Map();
        this.currentGroupedQuestionId = null;
    }

    processSpeech(speech) {
        // Track grouped questions (questions with same text asked by multiple MPs)
        if (speech.type === 'Start Question') {
          const questionText = speech.content.trim();
          if (!this.groupedQuestions.has(questionText)) {
            this.groupedQuestions.set(questionText, []);
          }
          this.currentGroupedQuestionId = questionText;
          this.groupedQuestions.get(questionText).push(speech);
        }
    
        super.processSpeech(speech);
    }

  shouldStartNewGroup(speech) {
    return speech.type === 'Start Question' || 
           (this.topicalQuestions && speech.type === 'Start TopicalQuestion');
  }

  determineGroupType(speech) {
    if (speech.content.includes('Topical Question')) {
      this.topicalQuestions = true;
      return 'TOPICAL';
    }
    return this.topicalQuestions ? 'TOPICAL' : 'SUBSTANTIVE';
  }

  finalizeCurrentGroup() {
    if (this.currentGroup) {
      this.questionGroups.push(this.currentGroup);
      this.currentGroup = null;
    }
  }
}

// Add PMQsSection class extending QuestionTimeSection
class PMQsSection extends QuestionTimeSection {
  constructor(metadata = {}) {
    super({ category: 'ORAL_QUESTIONS', type: 'PMQs' }, metadata);
    this.engagements = [];
    this.ministerialStatements = [];
    this.lastSpeakerStatement = null;
  }

  processSpeech(speech) {
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
    if (!this.statement && speech.speakerName === 'Lindsay Hoyle') {
      this.statement = speech;
    } else if (this.statement) {
      this.responses.push(speech);
    }
    super.addSpeech(speech);
  }
}

// Main processor class
class ParliamentaryProcessor {
  constructor(config = {}) {
    this.config = config;
    this.context = new ParliamentaryContext();
    this.currentBusiness = null;
    this.allBusiness = [];
    this.speakerStatements = [];
    this.currentDate = null;
    this.pendingDepartment = null;
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

  processNode(node) {
    this.context.updateContext(node);

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
    const type = this.determineBusinessType(node);
    this.finalizeCurrentBusiness();
    
    // Don't finalize business yet - wait for department
    this.pendingDepartment = {
      type: type,
      metadata: {
        id: node.getAttribute('id'),
        title: node.textContent.trim()
      }
    };
  }


  processMajorHeading(node) {
    const content = node.textContent.trim();
    
    // If we have a pending department, this major-heading completes it
    if (this.pendingDepartment) {
      const department = content;
      const type = {
        ...this.pendingDepartment.type,
        department: department
      };
      
      this.currentBusiness = this.createBusinessInstance(type, {
        ...this.pendingDepartment.metadata,
        subtitle: department
      });

      // Extract minister from "was asked" text if available
      const nextNode = node.nextElementSibling;
      if (nextNode && nextNode.nodeName === 'speech' && 
          nextNode.textContent.includes('was asked—')) {
        const ministerMatch = nextNode.textContent.match(/The (.+?) was asked/);
        if (ministerMatch) {
          this.currentBusiness.minister = ministerMatch[1].trim();
        }
      }

      this.pendingDepartment = null;
      return;
    }

    // Otherwise handle as normal
    const type = this.determineBusinessType(node);
    if (this.shouldCreateNewBusiness(type, content)) {
      this.finalizeCurrentBusiness();
      this.currentBusiness = this.createBusinessInstance(type, {
        id: node.getAttribute('id'),
        title: content
      });
    } else if (this.currentBusiness) {
      this.currentBusiness.metadata.subtitle = content;
    }
  }

  processSpeech(node) {
    if (!this.currentBusiness) {
      const type = this.determineBusinessType(node);
      this.currentBusiness = new ParliamentaryBusiness(type, {
        id: node.getAttribute('id')
      });
    }

    const speech = this.extractSpeech(node);
    
    // Use specialized processing for question time
    if (this.currentBusiness instanceof QuestionTimeSection) {
      this.currentBusiness.processSpeech(speech);
    } else {
      this.currentBusiness.addSpeech(speech);
    }
  }

  extractSpeech(node) {
    return {
      speakerId: node.getAttribute('person_id'),
      speakerName: node.getAttribute('speakername'),
      time: node.getAttribute('time'),
      type: node.getAttribute('type'),
      content: this.extractSpeechContent(node),
      procedural: this.isProceduralSpeech(node),
      colnum: node.getAttribute('colnum'),
      oral_qnum: node.getAttribute('oral-qnum')
    };
  }

  determineBusinessType(node) {
    // Normalize content
    const content = node.textContent.trim().replace(/\s+/g, ' ');
    
    // Check for Oral Questions
    if (content.includes('Oral Answers to Questions')) {
      return {
        category: 'ORAL_QUESTIONS',
        type: 'DEPARTMENTAL',
        department: null // Will be filled in by major-heading
      };
    }

    // Enhanced PMQs detection
    if (content.includes('Prime Minister') && 
        (content.includes('was asked—') || content.includes('Engagements'))) {
      return { category: 'ORAL_QUESTIONS', type: 'PMQs' };
    }

    // Check for Speaker's Statement
    if (content.includes("Speaker's Statement")) {
      return { category: 'STATEMENTS', type: 'SPEAKER' };
    }

    return super.determineBusinessType(node);
  }

  validateDocument(xmlDoc) {
    if (!xmlDoc || !xmlDoc.documentElement) {
      throw new Error('Invalid XML document');
    }
  }

  finalizeProcessing() {
    this.finalizeCurrentBusiness();
    return {
      business: this.allBusiness,
      metadata: {
        totalSpeeches: this.countTotalSpeeches(),
        uniqueSpeakers: this.context.speakers.size,
        duration: this.context.timing.getDuration()
      }
    };
  }

  finalizeCurrentBusiness() {
    if (this.currentBusiness) {
      this.allBusiness.push(this.currentBusiness);
      this.currentBusiness = null;
    }
  }

  handleError(error) {
    console.error('Error processing parliamentary business:', error);
    throw error;
  }

  shouldCreateNewBusiness(type, content) {
    // Create new business if:
    // 1. No current business exists
    // 2. Type is different from current business
    // 3. Type indicates a new section
    if (!this.currentBusiness) {
      return true;
    }

    // If type is different from current business, create new
    if (type.category !== this.currentBusiness.type.category || 
        type.type !== this.currentBusiness.type.type) {
      return true;
    }

    // Check if content indicates a new section based on business type markers
    const typeConfig = BUSINESS_TYPES[type.category]?.[type.type];
    if (typeConfig?.markers?.some(marker => content.includes(marker))) {
      return true;
    }

    return false;
  }

  extractSpeechContent(node) {
    // Get all text content, excluding nested speeches
    let content = '';
    for (const child of node.childNodes) {
      if (child.nodeName !== 'speech') {
        content += child.textContent;
      }
    }
    return content.trim();
  }

  isProceduralSpeech(node) {
    // Check if speech contains procedural markers
    const proceduralMarkers = [
      'Motion made',
      'Question put',
      'Question agreed to',
      'Division',
      'Amendment proposed',
      'Amendment withdrawn',
      'Amendment agreed to',
      'Point of Order'
    ];
    return proceduralMarkers.some(marker => node.textContent.includes(marker));
  }

  countTotalSpeeches() {
    return this.allBusiness.reduce((total, business) => {
      return total + business.speeches.length;
    }, 0);
  }

  processMinorHeading(node) {
    // Process minor headings - usually subsections
    if (this.currentBusiness) {
      const heading = {
        id: node.getAttribute('id'),
        text: node.textContent.trim()
      };
      this.currentBusiness.metadata.minorHeadings = 
        this.currentBusiness.metadata.minorHeadings || [];
      this.currentBusiness.metadata.minorHeadings.push(heading);
    }
  }

  createBusinessInstance(type, metadata) {
    return new ParliamentaryBusiness(type, metadata);
  }
}

// Create EnhancedParliamentaryProcessor extending ParliamentaryProcessor
class EnhancedParliamentaryProcessor extends ParliamentaryProcessor {
  constructor(config = {}) {
    super(config);
    this.speakerStatements = [];
    this.currentDate = null;
    this.pendingDepartment = null;
  }

  determineBusinessType(node) {
    // Normalize content by replacing newlines and multiple spaces with single spaces
    const content = node.textContent.trim().replace(/\s+/g, ' ');
    
    // Check for Departmental Questions first
    if (content.includes('Oral Answers to Questions')) {
      // Look for department name in subsequent major-heading
      let department = null;
      const nextNode = node.nextElementSibling;
      if (nextNode && nextNode.nodeName === 'major-heading') {
        department = nextNode.textContent.trim();
      }
      
      return {
        category: 'ORAL_QUESTIONS',
        type: 'DEPARTMENTAL',
        department: department
      };
    }
    
    // Check for Speaker's Statement
    if (content.includes("Speaker's Statement")) {
      return { category: 'STATEMENTS', type: 'SPEAKER' };
    }
    
    // Enhanced PMQs detection
    if (content.includes('Prime Minister') && 
        (content.includes('was asked—') || content.includes('Engagements'))) {
      return { category: 'ORAL_QUESTIONS', type: 'PMQs' };
    }

    // Check other business types
    for (const [category, types] of Object.entries(BUSINESS_TYPES)) {
      for (const [type, config] of Object.entries(types)) {
        if (config.requiresAllMarkers) {
          // If all markers must be present
          if (config.markers.every(marker => content.includes(marker))) {
            return { category, type };
          }
        } else {
          // If any marker is sufficient
          if (config.markers.some(marker => content.includes(marker))) {
            return { category, type };
          }
        }
      }
    }

    return { category: 'OTHER', type: 'UNCLASSIFIED' };
  }

  createBusinessInstance(type, metadata) {
    switch (type.type) {
      case 'PMQs':
        return new PMQsSection(metadata);
      case 'SPEAKER':
        return new SpeakersStatement(metadata);
      case 'DEPARTMENTAL':
        return new QuestionTimeSection(type, metadata);
      default:
        return super.createBusinessInstance(type, metadata);
    }
  }

  processNode(node) {
    this.context.updateContext(node);

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

    if (node.childNodes) {
      Array.from(node.childNodes).forEach(child => this.processNode(child));
    }
  }

  processSpeech(node) {
    if (!this.currentBusiness) {
      const type = this.determineBusinessType(node);
      this.currentBusiness = this.createBusinessInstance(type, {
        id: node.getAttribute('id')
      });
    }

    const speech = this.extractSpeech(node);
    
    // Enhanced speech processing
    speech.references = this.extractSpeechReferences(node);
    speech.interventions = this.extractInterventions(node);
    speech.procedural = this.isProceduralSpeech(node);
    
    if (this.currentBusiness) {
      this.currentBusiness.processSpeech(speech);
    }
  }

  extractSpeechReferences(node) {
    const references = {
      dates: [],
      members: [],
      standingOrders: []
    };

    if (!node.getElementsByTagName) {
      return references;
    }

    const phrases = node.getElementsByTagName('phrase');
    if (!phrases) {
      return references;
    }

    Array.from(phrases).forEach(phrase => {
      const className = phrase.getAttribute('class');
      const reference = {
        text: phrase.textContent,
        code: phrase.getAttribute('code')
      };

      switch (className) {
        case 'date':
          references.dates.push(reference);
          break;
        case 'honfriend':
          references.members.push({
            ...reference,
            personId: phrase.getAttribute('person_id'),
            name: phrase.getAttribute('name')
          });
          break;
        case 'standing-order':
          references.standingOrders.push(reference);
          break;
      }
    });

    return references;
  }

  extractInterventions(node) {
    const interventions = [];
    
    if (!node.getElementsByTagName) {
      return interventions;
    }

    const paragraphs = node.getElementsByTagName('p');
    if (!paragraphs) {
      return interventions;
    }
    
    Array.from(paragraphs).forEach(p => {
      if (this.isIntervention(p)) {
        interventions.push({
          type: this.getInterventionType(p),
          content: p.textContent,
          pid: p.getAttribute('pid')
        });
      }
    });

    return interventions;
  }

  isIntervention(paragraph) {
    const content = paragraph.textContent;
    return content.includes('Order') ||
           content.includes('I call') ||
           content.includes('Point of Order');
  }

  getInterventionType(paragraph) {
    const content = paragraph.textContent;
    if (content.includes('Point of Order')) return 'POINT_OF_ORDER';
    if (content.includes('Order')) return 'ORDER';
    if (content.includes('I call')) return 'SPEAKER_CALLING';
    return 'OTHER';
  }
}

// Utility functions
function extractReferences(node) {
  if (node.nodeType !== 1) return [];  // Skip if not element node
  
  const references = [];
  const links = node.getElementsByTagName('phrase');
  Array.from(links).forEach(link => {
    const className = link.getAttribute('class');
    if (className === 'standing-order' || className === 'date') {
      references.push({
        type: className,
        code: link.getAttribute('code'),
        text: link.textContent
      });
    }
  });
  return references;
}

function calculateDuration(start, end) {
  const startTime = new Date(`1970-01-01T${start}`);
  const endTime = new Date(`1970-01-01T${end}`);
  return (endTime - startTime) / 1000 / 60; // Duration in minutes
}

// Add utility functions
function extractMotionText(node) {
  const motionTexts = [];
  const paras = node.getElementsByTagName('p');
  
  Array.from(paras).forEach(p => {
    if (p.getAttribute('pwmotiontext') === 'yes') {
      motionTexts.push(p.textContent);
    }
  });
  
  return motionTexts;
}

function formatSpeechForDB(speech) {
  return {
    speaker_id: speech.speakerId,
    speaker_name: speech.speakerName,
    content: speech.content,
    time: speech.time,
    type: speech.type,
    column_number: speech.colnum,
    oral_qnum: speech.oral_qnum,
    is_procedural: speech.procedural,
    references: speech.references,
    interventions: speech.interventions
  };
}

// Export the module
module.exports = {
  ParliamentaryProcessor,
  EnhancedParliamentaryProcessor,
  PMQsSection,
  SpeakersStatement,
  QuestionTimeSection,
  SpeechGroup,
  BUSINESS_TYPES,
  formatSpeechForDB
};