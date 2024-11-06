const { ParliamentaryBusiness, EnhancedParliamentaryProcessor, BUSINESS_TYPES, ParliamentaryProcessor } = require('./parseCommons.cjs');

// Additional Lords-specific business types
const LORDS_BUSINESS_TYPES = {
  LORDS_INTRODUCTIONS: {
    DEFAULT: {
      markers: ['Introduction:', 'was introduced']
    }
  },
  LORDS_OATHS: {
    DEFAULT: {
      markers: ['Oaths and Affirmations', 'took the oath']
    }
  },
  LORDS_QUESTIONS: {
    ORAL_QUESTIONS: {
      markers: ['Question', 'To ask His Majesty\'s Government']
    }
  },
  LORDS_LEGISLATION: {
    FIRST_READING: {
      markers: ['First Reading', 'Bill [HL]']
    },
    SECOND_READING: {
      markers: ['Second Reading']
    }
  },
  LORDS_MOTIONS: {
    MEMBERSHIP: {
      markers: ['Membership Motion']
    }
  }
};

class LordsBusinessSection extends ParliamentaryBusiness {
  constructor(type, metadata = {}) {
    super(type, metadata);
    this.peersPresent = new Set();
    this.leadSpeaker = null;
    this.ministerResponding = null;
    this.royalAssent = false;
    this.committeeStage = false;
    
    // New fields for tracking contributions
    this.contributionTypes = {
      questions: 0,
      answers: 0,
      statements: 0,
      motions: 0,
      amendments: 0,
      withdrawals: 0
    };
    
    // Enhanced minister tracking
    this.ministerialResponses = new Map(); // minister -> [responses]
  }

  addSpeech(speech) {
    super.addSpeech(speech);
    
    if (speech.speakerId) {
      this.peersPresent.add(speech.speakerId);
    }

    // Track contribution types
    this.trackContributionType(speech);
    
    // Enhanced minister tracking
    if (speech.type === 'Start Answer' && this.isMinisterialSpeech(speech)) {
      const responses = this.ministerialResponses.get(speech.speakerName) || [];
      responses.push({
        time: speech.time,
        content: speech.content,
        role: this.extractMinisterialRole(speech.speakerName)
      });
      this.ministerialResponses.set(speech.speakerName, responses);
    }
  }

  trackContributionType(speech) {
    switch (speech.type) {
      case 'Start Question':
        this.contributionTypes.questions++;
        break;
      case 'Start Answer':
        this.contributionTypes.answers++;
        break;
      case 'Start Speech':
        if (this.isMotionSpeech(speech)) {
          this.contributionTypes.motions++;
        } else {
          this.contributionTypes.statements++;
        }
        break;
      // Add other types as needed
    }
  }

  isMinisterialSpeech(speech) {
    const ministerialTitles = [
      'Minister',
      'Secretary of State',
      'Parliamentary Under-Secretary',
      'Lord Chancellor'
    ];
    return ministerialTitles.some(title => 
      speech.speakerRole?.includes(title)
    );
  }

  extractMinisterialRole(name) {
    // Enhanced role extraction
    const rolePatterns = [
      /Minister (?:of|for) (?:State for )?([^,]+)/,
      /Parliamentary Under[- ]Secretary of State(?:, ([^,]+))?/,
      /Secretary of State for ([^,]+)/
    ];

    for (const pattern of rolePatterns) {
      const match = name.match(pattern);
      if (match) return match[1]?.trim() || match[0];
    }
    return null;
  }

  finalize() {
    return {
      ...super.finalize(),
      contributionTypes: this.contributionTypes,
      ministerialParticipation: Array.from(this.ministerialResponses.entries())
        .map(([minister, responses]) => ({
          name: minister,
          role: this.extractMinisterialRole(minister),
          responseCount: responses.length,
          responses: responses
        }))
    };
  }

  isMotionSpeech(node) {
    // Check for pwmotiontext paragraphs
    const paragraphs = Array.from(node.getElementsByTagName('p'));
    
    // Check for both pwmotiontext and motion introduction format
    return paragraphs.some(p => 
      p.getAttribute('pwmotiontext') === 'unrecognized' ||
      (p === paragraphs[0] && p.textContent.trim().startsWith('Moved by'))
    );
  }

  extractMotions(node, speech) {
    const paragraphs = Array.from(node.getElementsByTagName('p'));
    const motions = [];
    let currentMotion = null;

    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      
      // Start new motion when "Moved by" is found
      if (text.startsWith('Moved by')) {
        if (currentMotion) {
          motions.push(currentMotion);
        }
        currentMotion = {
          text: [],
          mover: text.replace('Moved by', '').trim(),
          status: 'PROPOSED',
          time: speech.time
        };
      } 
      // Add text to current motion if it exists
      else if (currentMotion && p.getAttribute('pwmotiontext') === 'unrecognized') {
        currentMotion.text.push(text);
      }
    });

    // Add final motion if exists
    if (currentMotion) {
      motions.push(currentMotion);
    }

    // Add amendment details if applicable
    const precedingHeading = this.getPrecedingHeading(node);
    if (precedingHeading?.textContent.includes('Amendment')) {
      motions.forEach(motion => {
        motion.type = 'AMENDMENT';
        motion.number = precedingHeading.textContent.trim().split(' ')[1];
      });
    }

    return motions;
  }
}

class LordsQuestionTime extends LordsBusinessSection {
  constructor(metadata = {}) {
    super({ category: 'LORDS_QUESTIONS', type: 'ORAL' }, metadata);
    this.questioner = null;
    this.supplementaryQuestioners = [];
    this.questionGroups = [];
    this.currentGroup = null;
    this.isPrivateNotice = false;
    this.isUrgent = false;
  }

  addSpeech(speech) {
    super.addSpeech(speech);

    if (speech.type === 'Start Speech' && !this.questioner) {
      this.questioner = speech.speakerName;
    } else if (speech.type === 'Start Question' && !this.currentGroup) {
      this.startNewQuestionGroup(speech);
    } else if (this.currentGroup) {
      if (speech.type === 'Start Answer') {
        this.currentGroup.ministerAnswer = speech;
      } else if (speech.type === 'Start Question') {
        this.currentGroup.supplementaries.push({
          question: speech,
          answer: null
        });
      } else if (speech.type === 'Start Speech') {
        this.currentGroup.speakerInterventions.push(speech);
      }
    }
  }

  startNewQuestionGroup(speech) {
    this.finalizeCurrentQuestionGroup();
    this.currentGroup = {
      mainQuestion: speech,
      ministerAnswer: null,
      supplementaries: [],
      speakerInterventions: []
    };
    this.questionGroups.push(this.currentGroup);
  }

  finalizeCurrentQuestionGroup() {
    if (this.currentGroup) {
      // Clean up any incomplete supplementaries
      this.currentGroup.supplementaries = this.currentGroup.supplementaries.filter(
        supp => supp.question && supp.answer
      );
      this.currentGroup = null;
    }
  }

  finalize() {
    this.finalizeCurrentQuestionGroup();
    return {
      questioner: this.questioner,
      supplementaryQuestioners: this.supplementaryQuestioners,
      questionGroups: this.questionGroups,
      isPrivateNotice: this.isPrivateNotice,
      isUrgent: this.isUrgent
    };
  }
}

class LordsLegislativeStage extends LordsBusinessSection {
  constructor(type, metadata = {}) {
    super(type, metadata);
    this.amendments = [];
    this.divisions = [];
    this.royalPrerogative = false;
  }

  processDivision(division) {
    const divisionRecord = {
      id: division.id,
      number: division.number,
      date: division.date,
      time: division.time,
      counts: division.counts,
      contents: [],
      notContents: [],
      tellers: {
        contents: [],
        notContents: []
      }
    };
    this.divisions.push(divisionRecord);
  }
}

class LordsParliamentaryProcessor extends EnhancedParliamentaryProcessor {
  constructor(config = {}) {
    super(config);
    this.businessTypes = {
      ...BUSINESS_TYPES,
      ...LORDS_BUSINESS_TYPES
    };
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

  processMajorHeading(node) {
    const content = node.textContent.trim();
    const type = this.determineBusinessType(node);
    
    if (this.shouldCreateNewBusiness(type, content)) {
      this.finalizeCurrentBusiness();
      this.currentBusiness = this.createBusinessInstance(type, {
        id: node.getAttribute('id'),
        title: content
      });
    }
  }

  processSpeech(node) {
    if (!this.currentBusiness) return;

    const speech = this.extractSpeech(node);
    
    // Extract quoted text
    speech.quotedText = this.extractQuotedText(node);
    
    // Enhanced metadata
    speech.metadata = {
      peerageType: this.extractPeerageType(speech.speakerName),
      position: this.extractPosition(speech.speakerName),
      isMinisterial: this.isMinisterialSpeech(speech),
      procedural: this.isProceduralContent(node)
    };

    super.processSpeech(node);
  }

  extractQuotedText(node) {
    return Array.from(node.getElementsByTagName('p'))
      .filter(p => p.getAttribute('class')?.includes('indent') || 
                   p.getAttribute('class')?.includes('quote'))
      .map(p => ({
        text: p.textContent.trim(),
        source: p.getAttribute('source') || null,
        isIndented: p.getAttribute('class')?.includes('indent') || false
      }));
  }

  isProceduralContent(node) {
    const proceduralPhrases = [
      'My Lords',
      'I beg to move',
      'The Question is',
      'Noble Lords',
      'with the leave of the House'
    ];
    
    return proceduralPhrases.some(phrase => 
      node.textContent.includes(phrase)
    );
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
    const positions = [
      'Lord Chancellor',
      'Leader of the House',
      'Lord Privy Seal',
      'Lord Speaker'
    ];
    return positions.find(p => name?.includes(p)) || null;
  }

  determineBusinessType(node) {
    const content = node.textContent.trim();
    
    // Check for introductions
    if (content.includes('Introduction:')) {
      return { category: 'LORDS_INTRODUCTIONS', type: 'DEFAULT' };
    }
    
    // Check for oaths
    if (content.includes('Oaths and Affirmations')) {
      return { category: 'LORDS_OATHS', type: 'DEFAULT' };
    }
    
    // Check for questions
    if (content.includes('Question')) {
      return { category: 'LORDS_QUESTIONS', type: 'ORAL_QUESTIONS' };
    }
    
    // Check for legislation
    if (content.includes('Bill [HL]') && content.includes('First Reading')) {
      return { category: 'LORDS_LEGISLATION', type: 'FIRST_READING' };
    }
    
    // Check for membership motions
    if (content.includes('Membership Motion')) {
      return { category: 'LORDS_MOTIONS', type: 'MEMBERSHIP' };
    }

    return super.determineBusinessType(node);
  }

  isMotionSpeech(node) {
    // Check for pwmotiontext paragraphs
    const paragraphs = Array.from(node.getElementsByTagName('p'));
    
    // Check for both pwmotiontext and motion introduction format
    return paragraphs.some(p => 
      p.getAttribute('pwmotiontext') === 'unrecognized' ||
      (p === paragraphs[0] && p.textContent.trim().startsWith('Moved by'))
    );
  }

  extractMotion(node, speech) {
    const paragraphs = Array.from(node.getElementsByTagName('p'));
    const motionParagraphs = paragraphs.filter(p => 
      p.getAttribute('pwmotiontext') === 'unrecognized' || 
      (!p.getAttribute('class')?.includes('italic') && 
       !p.textContent.trim().startsWith('Moved by'))
    );

    // Skip if no motion text found
    if (motionParagraphs.length === 0) return null;

    let mover = speech.speakerName;
    const firstPara = paragraphs[0]?.textContent.trim();
    if (firstPara.startsWith('Moved by')) {
      mover = firstPara.replace('Moved by', '').trim();
    }

    // Extract motion text, excluding procedural italic paragraphs
    const text = motionParagraphs
      .map(p => p.textContent.trim())
      .filter(text => text);

    // If this is an amendment, add amendment details
    const precedingHeading = this.getPrecedingHeading(node);
    const isAmendment = precedingHeading?.textContent.includes('Amendment');

    return {
      text,
      mover,
      status: 'PROPOSED',
      time: speech.time,
      ...(isAmendment && {
        type: 'AMENDMENT',
        number: precedingHeading.textContent.trim().split(' ')[1]
      })
    };
  }

  getPrecedingHeading(node) {
    let currentNode = node.previousSibling;
    while (currentNode) {
      if (currentNode.nodeName.toLowerCase().includes('heading')) {
        return currentNode;
      }
      currentNode = currentNode.previousSibling;
    }
    return null;
  }

  extractMotions(node, speech) {
    const paragraphs = Array.from(node.getElementsByTagName('p'));
    const motions = [];
    let currentMotion = null;

    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      
      // Start new motion when "Moved by" is found
      if (text.startsWith('Moved by')) {
        if (currentMotion) {
          motions.push(currentMotion);
        }
        currentMotion = {
          text: [],
          mover: text.replace('Moved by', '').trim(),
          status: 'PROPOSED',
          time: speech.time
        };
      } 
      // Add text to current motion if it exists
      else if (currentMotion && p.getAttribute('pwmotiontext') === 'unrecognized') {
        currentMotion.text.push(text);
      }
    });

    // Add final motion if exists
    if (currentMotion) {
      motions.push(currentMotion);
    }

    // Add amendment details if applicable
    const precedingHeading = this.getPrecedingHeading(node);
    if (precedingHeading?.textContent.includes('Amendment')) {
      motions.forEach(motion => {
        motion.type = 'AMENDMENT';
        motion.number = precedingHeading.textContent.trim().split(' ')[1];
      });
    }

    return motions;
  }

  determineSpeechType(node, speech) {
    if (this.isMotionText(node)) return 'motion';
    if (node.querySelector('p[pwmotiontext]')) return 'motion';
    if (speech.content?.toLowerCase().includes('amendment')) return 'amendment';
    return 'speech';
  }

  isMotionText(node) {
    const paragraphs = Array.from(node.getElementsByTagName('p'));
    return paragraphs.some(p => 
      p.getAttribute('pwmotiontext') === 'unrecognized' ||
      (p === paragraphs[0] && p.textContent.trim().startsWith('Moved by'))
    );
  }

  extractQuotedText(node) {
    return Array.from(node.getElementsByTagName('p'))
      .filter(p => p.getAttribute('class')?.includes('indent') || 
                   p.getAttribute('class')?.includes('quote'))
      .map(p => ({
        text: p.textContent.trim(),
        source: p.getAttribute('source') || null,
        isIndented: p.getAttribute('class')?.includes('indent') || false
      }));
  }

  isProceduralContent(node) {
    const proceduralPhrases = [
      'My Lords',
      'I beg to move',
      'The Question is',
      'Noble Lords',
      'with the leave of the House'
    ];
    
    return proceduralPhrases.some(phrase => 
      node.textContent.includes(phrase)
    );
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
    const positions = [
      'Lord Chancellor',
      'Leader of the House',
      'Lord Privy Seal',
      'Lord Speaker'
    ];
    return positions.find(p => name?.includes(p)) || null;
  }

  determineBusinessType(node) {
    const content = node.textContent.trim();
    
    // Check for introductions
    if (content.includes('Introduction:')) {
      return { category: 'LORDS_INTRODUCTIONS', type: 'DEFAULT' };
    }
    
    // Check for oaths
    if (content.includes('Oaths and Affirmations')) {
      return { category: 'LORDS_OATHS', type: 'DEFAULT' };
    }
    
    // Check for questions
    if (content.includes('Question')) {
      return { category: 'LORDS_QUESTIONS', type: 'ORAL_QUESTIONS' };
    }
    
    // Check for legislation
    if (content.includes('Bill [HL]') && content.includes('First Reading')) {
      return { category: 'LORDS_LEGISLATION', type: 'FIRST_READING' };
    }
    
    // Check for membership motions
    if (content.includes('Membership Motion')) {
      return { category: 'LORDS_MOTIONS', type: 'MEMBERSHIP' };
    }

    return super.determineBusinessType(node);
  }

  isMinisterialSpeech(speakerName, speakerRole) {
    const ministerialTitles = [
      'Minister',
      'Secretary of State',
      'Parliamentary Under-Secretary',
      'Lord Chancellor'
    ];
    return ministerialTitles.some(title => 
      speakerRole?.includes(title) || speakerName?.includes(title)
    );
  }
}

module.exports = {
  LordsParliamentaryProcessor,
  LORDS_BUSINESS_TYPES,
  LordsQuestionTime,
  LordsLegislativeStage
};