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
    this.currentBusiness = null;
    this.procedural = new ProceduralContext();
    this.timing = new TimingContext();
    this.speakers = new Set();
    this.references = [];
  }

  updateContext(node) {
    this.procedural.updateContext(node);
    this.timing.updateContext(node);
    this.updateReferences(node);
  }

  updateReferences(node) {
    const refs = extractReferences(node);
    if (refs.length) {
      this.references.push(...refs);
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
    this.motions = [];
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

  addMotion(motion) {
    this.motions.push(motion);
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

// Main processor class
class ParliamentaryProcessor {
  constructor(config = {}) {
    this.config = config;
    this.context = new ParliamentaryContext();
    this.currentBusiness = null;
    this.allBusiness = [];
    this.inOralQuestions = false;
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
    this.finalizeCurrentBusiness();
    this.inOralQuestions = true;
    this.currentBusiness = new QuestionTimeSection({
      category: 'ORAL_QUESTIONS',
      type: 'DEPARTMENTAL'
    }, {
      id: node.getAttribute('id'),
      title: node.textContent.trim(),
      departments: []
    });
  }

  processMajorHeading(node) {
    const content = node.textContent.trim();
    
    if (this.inOralQuestions) {
      if (!content.includes('was asked—') && !this.isOralQuestionsDepartment(content)) {
        this.inOralQuestions = false;
        this.finalizeCurrentBusiness();
        
        const type = this.determineBusinessType(node);
        this.currentBusiness = new ParliamentaryBusiness(type, {
          id: node.getAttribute('id'),
          title: content
        });
      } else {
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

    const type = this.determineBusinessType(node);
    if (this.shouldCreateNewBusiness(type, content)) {
      this.finalizeCurrentBusiness();
      this.currentBusiness = new ParliamentaryBusiness(type, {
        id: node.getAttribute('id'),
        title: content
      });
    }
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

  processSpeech(node) {
    if (!this.currentBusiness) return;

    const speech = this.extractSpeech(node);
    
    if (this.isMotionSpeech(node)) {
      const motion = {
        text: this.extractMotionText(node),
        mover: speech.speakerName,
        status: 'PROPOSED',
        time: speech.time
      };
      this.currentBusiness.addMotion(motion);
    }

    if (this.inOralQuestions) {
      this.processOralQuestionSpeech(speech);
    } else {
      this.currentBusiness.addSpeech(speech);
    }

    if (speech.speakerId) {
      this.context.speakers.add(speech.speakerId);
    }
  }

  processOralQuestionSpeech(speech) {
    const department = this.currentBusiness.currentDepartment;
    if (!department) return;

    if (speech.content?.includes('was asked—')) {
      const ministerMatch = speech.content.match(/The (.+?) was asked/);
      if (ministerMatch) {
        department.minister = ministerMatch[1].trim();
      }
      return;
    }

    switch(speech.type) {
      case 'Start Question':
        const questionGroup = {
          topic: department.currentTopic?.text,
          mainQuestion: speech,
          supplementaries: [],
          answers: []
        };
        department.questions.push(questionGroup);
        department.currentGroup = questionGroup;
        break;

      case 'Start Answer':
        if (department.currentGroup) {
          if (department.currentGroup.supplementaries.length > 0) {
            const lastSupplementary = department.currentGroup.supplementaries[department.currentGroup.supplementaries.length - 1];
            if (!lastSupplementary.answer) {
              lastSupplementary.answer = speech;
            }
          } else {
            department.currentGroup.answers.push(speech);
          }
        }
        break;

      case 'Start SupplementaryQuestion':
        if (department.currentGroup) {
          department.currentGroup.supplementaries.push({
            question: speech,
            answer: null
          });
        }
        break;
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
    const content = node.textContent.trim();
    
    if (content.match(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*:\s+[A-Z][a-z]/)) {
      return {
        category: 'MINISTERIAL_STATEMENTS',
        type: 'STATEMENT'
      };
    }

    if (this.inOralQuestions && !content.includes('was asked—') && 
        !content.includes('Oral Answers')) {
      this.inOralQuestions = false;
    }

    for (const [category, types] of Object.entries(BUSINESS_TYPES)) {
      for (const [type, config] of Object.entries(types)) {
        if (config.requiresAllMarkers) {
          if (config.markers.every(marker => content.includes(marker))) {
            return { category, type };
          }
          continue;
        }

        if (config.markers.some(marker => content.includes(marker))) {
          if (category === 'ORAL_QUESTIONS' && config.subTypes) {
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

    return { category: 'OTHER', type: 'UNCLASSIFIED' };
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
        duration: this.context.timing.getDuration(),
        divisions: this.context.procedural.divisionProcessor?.getDivisionStats() || []
      }
    };
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
      
      this.context.procedural = new ProceduralContext();
    }
  }

  handleError(error) {
    console.error('Error processing parliamentary business:', error);
    throw error;
  }

  shouldCreateNewBusiness(type, content) {
    if (this.inOralQuestions && !content.includes('was asked—')) {
      return true;
    }

    if (!this.currentBusiness) return true;
    
    if (type.category !== this.currentBusiness.type.category || 
        type.type !== this.currentBusiness.type.type) {
      return true;
    }

    const typeConfig = BUSINESS_TYPES[type.category]?.[type.type];
    if (typeConfig?.markers.some(marker => content.includes(marker))) {
      return true;
    }

    return false;
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

  isProceduralSpeech(node) {
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

  processMinorHeading(node) {
    const content = node.textContent.trim();
    
    if (this.inOralQuestions && this.currentBusiness?.currentDepartment) {
      const topic = {
        id: node.getAttribute('id'),
        text: content,
        questions: []
      };
      
      const topicMeta = {
        id: node.getAttribute('id'),
        text: content
      };
      
      const deptMeta = this.currentBusiness.metadata.departments.find(
        d => d.id === this.currentBusiness.currentDepartment.id
      );
      if (deptMeta) {
        deptMeta.topics.push(topicMeta);
      }

      this.currentBusiness.currentDepartment.topics.push(topic);
      this.currentBusiness.currentDepartment.currentTopic = topic;
    } else if (this.currentBusiness) {
      this.currentBusiness.metadata.minorHeadings = 
        this.currentBusiness.metadata.minorHeadings || [];
      this.currentBusiness.metadata.minorHeadings.push({
        id: node.getAttribute('id'),
        text: content
      });
    }
  }

  isMotionSpeech(node) {
    const motionIndicators = [
      'I beg to move',
      'moved,',
      'That this House'
    ];
    return motionIndicators.some(indicator => 
      node.textContent.includes(indicator)
    );
  }

  extractMotionText(node) {
    const text = [];
    let currentNode = node;
    
    // Look for motion text in the current and subsequent paragraphs
    while (currentNode) {
      if (currentNode.nodeName === 'p') {
        const content = currentNode.textContent.trim();
        if (content.startsWith('That') || text.length > 0) {
          text.push(content);
        }
        // Stop if we hit another speech or heading
        if (currentNode.nextSibling?.nodeName === 'speech' || 
            currentNode.nextSibling?.nodeName.includes('heading')) {
          break;
        }
      }
      currentNode = currentNode.nextSibling;
    }
    
    return text;
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

class EnhancedParliamentaryProcessor extends ParliamentaryProcessor {
  constructor(config = {}) {
    super(config);
    this.speakerStatements = [];
    this.currentDate = null;
    this.pendingDepartment = null; // Track department from oral-heading/major-heading sequence
  }

  processOralHeading(node) {
    const type = this.determineBusinessType(node);
    this.finalizeCurrentBusiness();
    
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

  determineBusinessType(node) {
    const content = node.textContent.trim().replace(/\s+/g, ' ');
    
    if (content.includes('Oral Answers to Questions')) {
      return {
        category: 'ORAL_QUESTIONS',
        type: 'DEPARTMENTAL',
        department: null // Will be filled in by major-heading
      };
    }

    if (content.includes('Prime Minister') && 
        (content.includes('was asked—') || content.includes('Engagements'))) {
      return { category: 'ORAL_QUESTIONS', type: 'PMQs' };
    }

    if (content.includes("Speaker's Statement")) {
      return { category: 'STATEMENTS', type: 'SPEAKER' };
    }

    return super.determineBusinessType(node);
  }

  createBusinessInstance(type, metadata) {
    if (type.category === 'ORAL_QUESTIONS') {
      switch (type.type) {
        case 'DEPARTMENTAL':
          return new QuestionTimeSection({
            category: 'ORAL_QUESTIONS',
            type: 'DEPARTMENTAL',
            department: type.department
          }, {
            ...metadata,
            minister: type.minister || null
          });
        case 'PMQs':
          return new PMQsSection(metadata);
      }
    }

    if (type.category === 'STATEMENTS' && type.type === 'SPEAKER') {
      return new SpeakersStatement(metadata);
    }

    return new ParliamentaryBusiness(type, metadata);
  }

  shouldCreateNewBusiness(type, content) {
    if (this.pendingDepartment) {
      return false;
    }

    return super.shouldCreateNewBusiness(type, content);
  }
}

// Enhance QuestionTimeSection to better handle departmental info
class QuestionTimeSection extends ParliamentaryBusiness {
  constructor(type, metadata = {}) {
    super(type, metadata);
    this.currentDepartment = null;
    this.metadata.departments = [];
    this.speeches = [];
    this.questionGroups = [];
  }

  addSpeech(speech) {
    // Do nothing - speeches are handled by processOralQuestionSpeech
  }

  processSpeech(speech) {
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
}

class DivisionProcessor {
  constructor() {
    this.currentDivision = null;
    this.divisions = [];
  }

  processDivision(node) {
    if (node.nodeName !== 'division') return;

    this.currentDivision = {
      id: node.getAttribute('id'),
      date: node.getAttribute('divdate'),
      number: node.getAttribute('divnumber'),
      time: node.getAttribute('time'),
      counts: this.extractCounts(node),
      votes: {
        ayes: [],
        noes: [],
        tellers: {
          ayes: [],
          noes: []
        }
      }
    };

    const ayesList = node.querySelector('mplist[vote="aye"]');
    const noesList = node.querySelector('mplist[vote="no"]');

    if (ayesList) this.processVoteList(ayesList, 'ayes');
    if (noesList) this.processVoteList(noesList, 'noes');

    this.divisions.push(this.currentDivision);
  }

  extractCounts(node) {
    const countNode = node.querySelector('divisioncount');
    if (countNode) {
      return {
        ayes: parseInt(countNode.getAttribute('ayes')),
        noes: parseInt(countNode.getAttribute('noes'))
      };
    }
    return null;
  }

  processVoteList(listNode, type) {
    const votes = Array.from(listNode.getElementsByTagName('mpname'));
    
    votes.forEach(vote => {
      const voteRecord = {
        memberId: vote.getAttribute('person_id'),
        name: vote.textContent.trim(),
        isTeller: vote.getAttribute('teller') === 'yes'
      };

      if (voteRecord.isTeller) {
        this.currentDivision.votes.tellers[type].push(voteRecord);
      } else {
        this.currentDivision.votes[type].push(voteRecord);
      }
    });
  }
}

// Update the ProceduralContext to use the new division processor
class EnhancedProceduralContext extends ProceduralContext {
  constructor() {
    super();
    this.divisionProcessor = new DivisionProcessor();
  }

  updateContext(node) {
    super.updateContext(node);
    
    if (node.nodeName === 'division') {
      this.divisionProcessor.processDivision(node);
    }
  }

  getDivisionStats() {
    return this.divisionProcessor.divisions.map(division => ({
      id: division.id,
      number: division.number,
      result: division.counts.ayes > division.counts.noes ? 'PASSED' : 'REJECTED',
      counts: division.counts,
      participation: division.counts.ayes + division.counts.noes,
      margin: Math.abs(division.counts.ayes - division.counts.noes),
      tellerCount: division.votes.tellers.ayes.length + division.votes.tellers.noes.length
    }));
  }
}

module.exports = {
  EnhancedParliamentaryProcessor,
  ParliamentaryBusiness,
  QuestionTimeSection,
  EnhancedProceduralContext,
  ParliamentaryProcessor,
  BUSINESS_TYPES,
  SpeechGroup
};