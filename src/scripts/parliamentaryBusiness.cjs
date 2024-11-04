// Add Node type constants at the top of the file
const NODE_TYPES = {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
    COMMENT_NODE: 8
};

const SHARED_BUSINESS_TYPES = {
  PRAYERS: {
    category: 'PROCEDURAL',
    type: 'PRAYERS',
    markers: ['Prayers'],
    precedence: 1
  },
  STATEMENTS: {
    MINISTERIAL: {
      category: 'STATEMENTS',
      type: 'MINISTERIAL',
      markers: ['Ministerial Statement', 'Statement'],
      precedence: 3
    },
    BUSINESS: {
      category: 'STATEMENTS',
      type: 'BUSINESS',
      markers: ['Business Statement'],
      precedence: 3
    },
    SPEAKER: {
      category: 'STATEMENTS',
      type: 'SPEAKER',
      markers: ['Speaker\'s Statement'],
      precedence: 2
    }
  },
  POINTS_OF_ORDER: {
    category: 'PROCEDURAL',
    type: 'POINTS_OF_ORDER',
    markers: ['Point of Order']
  },
  TRIBUTES: {
    category: 'TRIBUTES',
    type: 'TRIBUTES',
    markers: ['tribute', 'tributes'],
    isSubType: true
  },
  RESPONSES: {
    category: 'RESPONSES',
    type: 'RESPONSES',
    markers: ['Hear, hear'],
    isResponse: true
  }
};

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
      this.businessTypes = config.businessTypes || SHARED_BUSINESS_TYPES;
      this.divisionProcessor = new DivisionProcessor();
      this.references = {
        members: new Set(),
        dates: new Set(),
        bills: new Set(),
        standingOrders: new Set(),
        hansard: new Set(),
        quotedText: []
      };
    }
  
    process(xmlDoc) {
      try {
        this.validateDocument(xmlDoc);
        this.processNode(xmlDoc.documentElement);
        return this.finalizeProcessing();
      } catch (error) {
        console.error('Error processing parliamentary business:', error);
        throw error;
      }
    }
  
    processNode(node) {
      if (!node || node.nodeType !== NODE_TYPES.ELEMENT_NODE) return;

      try {
        // Handle member references
        if (node.nodeName.toLowerCase() === 'member') {
          const memberRef = new this.constructor.MemberReference(node);
          this.references.members.add(memberRef.toJSON());
        }

        this.context.updateContext(node);

        // Transfer references from context to current business
        if (this.currentBusiness && this.context.references) {
          Object.entries(this.context.references).forEach(([type, refs]) => {
            if (refs instanceof Set) {
              this.currentBusiness.references[type] = [
                ...new Set([
                  ...(this.currentBusiness.references[type] || []),
                  ...Array.from(refs)
                ])
              ];
            }
          });
        }

        // Track column numbers
        if (node.hasAttribute('colnum')) {
          this.currentColumnNumber = parseInt(node.getAttribute('colnum'));
        }

        switch (node.nodeName.toLowerCase()) {
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
          case 'division':
            const division = this.divisionProcessor.processDivision(node);
            if (division && this.currentBusiness) {
              this.currentBusiness.divisions.push(division);
            }
            break;
        }

        // Process child nodes if they exist
        if (node.childNodes && node.childNodes.length > 0) {
          Array.from(node.childNodes)
            .filter(child => child.nodeType === NODE_TYPES.ELEMENT_NODE)
            .forEach(child => this.processNode(child));
        }
      } catch (error) {
        console.warn(`Error processing node: ${error.message}`);
        // Continue processing other nodes
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
  
        // Look ahead for "was asked" text to identify minister
        const nextNode = node.nextElementSibling;
        if (nextNode && nextNode.nodeName === 'speech') {
          const wasAskedMatch = nextNode.textContent.match(/The ([^.]+?) was asked/);
          if (wasAskedMatch) {
            const ministerRole = wasAskedMatch[1].trim();
            // Store minister role to be matched with first answering speaker
            this.currentBusiness.pendingMinisterRole = ministerRole;
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
      const speech = this.extractSpeech(node);
      
      // For Question Time - check for "was asked" text
      if (speech.content?.includes('was asked')) {
        // Store pending minister role for next answering speaker
        const wasAskedMatch = speech.content.match(/The ([^.]+?) was asked/);
        if (wasAskedMatch) {
          this.currentBusiness.pendingMinisterRole = wasAskedMatch[1].trim();
        }
      }
      
      // If we have a pending minister role and this is an answer
      if (this.currentBusiness?.pendingMinisterRole && 
          (speech.type === 'Start Answer' || speech.type === 'Answer')) {
        this.currentBusiness.leadMinister = {
          id: speech.speakerId,
          name: speech.speakerName,
          role: this.currentBusiness.pendingMinisterRole
        };
        this.currentBusiness.pendingMinisterRole = null;
      }

      // For other cases - check "I call" pattern
      const prevSpeech = this.getPreviousSpeech();
      if (prevSpeech?.content?.includes('I call')) {
        const iCallMatch = prevSpeech.content.match(/I call (?:the )?([^.(]+)/i);
        if (iCallMatch) {
          this.currentBusiness.leadMinister = {
            id: speech.speakerId,
            name: speech.speakerName,
            role: iCallMatch[1].trim()
          };
        }
      }

      // Add speech to current business
      if (this.currentBusiness) {
        this.currentBusiness.addSpeech(speech);
      }
    }

    // Helper method to get previous speech
    getPreviousSpeech() {
      if (!this.currentBusiness?.speeches?.length) {
        return null;
      }
      return this.currentBusiness.speeches[this.currentBusiness.speeches.length - 1];
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
        oral_qnum: node.getAttribute('oral-qnum'),
        quotedText: this.extractQuotedText(node)
      };
    }
  
    extractQuotedText(node) {
      const quotes = [];
      if (!node.getElementsByTagName) return null;
      
      const paras = Array.from(node.getElementsByTagName('p'));
      
      for (const p of paras) {
        if (p.getAttribute('pwmotiontext') === 'yes' || p.getAttribute('pwmotiontext') === 'unrecognized') {
          quotes.push({
            text: p.textContent.trim(),
            type: this.determineQuoteType(p),
            pid: p.getAttribute('pid')
          });
          continue;
        }
  
        if (p.getAttribute('class')?.includes('indent')) {
          quotes.push({
            text: p.textContent.trim(),
            type: 'DIRECT_QUOTE',
            pid: p.getAttribute('pid')
          });
          continue;
        }
      }
      
      return quotes.length > 0 ? quotes : null;
    }
  
    determineQuoteType(node) {
      const text = node.textContent.toLowerCase();
      const classes = node.getAttribute('class') || '';
      
      // Procedural motions
      if (text.includes('motion made') || text.includes('question put')) {
        return 'PROCEDURAL_MOTION';
      }
  
      // Amendment motions
      if (text.includes('amendment proposed') || 
          text.includes('leave out') || 
          text.includes('at end insert')) {
        return 'AMENDMENT';
      }
  
      // Division results
      if (text.includes('the house divided') || 
          text.includes('ayes') || 
          text.includes('noes')) {
        return 'DIVISION_RESULT';
      }
  
      // Standing Order references
      if (text.includes('standing order')) {
        return 'STANDING_ORDER';
      }
  
      // Formal motions
      if (text.includes('moved by') || text.includes('that this house')) {
        return 'FORMAL_MOTION';
      }
  
      // Indented quotes (usually direct quotes)
      if (classes.includes('indent')) {
        return 'DIRECT_QUOTE';
      }
  
      // Default for unclassified quotes
      return 'OTHER';
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
  
    determineBusinessType(node) {
        if (!node || !node.textContent) return { category: 'OTHER', type: null };
        
        const content = node.textContent.trim();
        if (!content) return { category: 'OTHER', type: null };

        for (const [category, typeConfig] of Object.entries(this.businessTypes)) {
            // Handle direct category markers
            if (typeConfig.markers && Array.isArray(typeConfig.markers)) {
                if (this.matchesMarkers(content, typeConfig.markers, typeConfig.requiresAllMarkers)) {
                    return { category, type: null };
                }
            }

            // Handle nested types
            if (typeof typeConfig === 'object' && !Array.isArray(typeConfig)) {
                for (const [type, config] of Object.entries(typeConfig)) {
                    if (!config || typeof config !== 'object') continue;

                    // Check type markers
                    if (config.markers && Array.isArray(config.markers)) {
                        if (this.matchesMarkers(content, config.markers, config.requiresAllMarkers)) {
                            return { category, type };
                        }
                    }

                    // Check subtypes
                    if (config.subTypes) {
                        for (const [subType, subConfig] of Object.entries(config.subTypes)) {
                            if (subConfig.markers && Array.isArray(subConfig.markers)) {
                                if (this.matchesMarkers(content, subConfig.markers, subConfig.requiresAllMarkers)) {
                                    return { category, type, subType };
                                }
                            }
                        }
                    }
                }
            }
        }

        return { category: 'OTHER', type: null };
    }

    matchesMarkers(content, markers, requireAll = false) {
        if (!Array.isArray(markers) || markers.length === 0) return false;
        
        if (requireAll) {
            return markers.every(marker => content.includes(marker));
        }
        return markers.some(marker => content.includes(marker));
    }
  
    validateDocument(xmlDoc) {
      if (!xmlDoc || !xmlDoc.documentElement) {
        throw new Error('Invalid XML document');
      }
      this.currentDate = xmlDoc.documentElement.getAttribute('date') || 
                        this.config.date;
    }
  
    finalizeProcessing() {
      try {
        // Finalize any pending business
        this.finalizeCurrentBusiness();

        return {
          business: this.allBusiness.map(business => business.finalize()),
          metadata: {
            date: this.currentDate,
            references: this.formatReferencesForDB(),
            speakerStatements: this.speakerStatements
          }
        };
      } catch (error) {
        console.error('Error finalizing processing:', error);
        throw error;
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
      const typeConfig = SHARED_BUSINESS_TYPES[type.category]?.[type.type];
      if (typeConfig?.markers?.some(marker => content.includes(marker))) {
        return true;
      }
  
      return false;
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

    processQuestionGroup(node) {
        const questionType = this.identifyQuestionType(node);
        const isSupplementary = node.getAttribute('type')?.includes('Supplementary');
        
        return {
            type: questionType,
            isSupplementary,
            speakerId: node.getAttribute('person_id'),
            text: node.textContent
        };
    }

    updateContext(node) {
        this.processReferences(node);
    }

    finalizeCurrentBusiness() {
      if (this.currentBusiness) {
        this.allBusiness.push(this.currentBusiness);
        this.currentBusiness = null;
      }
    }

    formatReferencesForDB() {
        return {
            members: Array.from(this.references.members.values()),
            dates: Array.from(this.references.dates),
            bills: Array.from(this.references.bills),
            standingOrders: Array.from(this.references.standingOrders),
            hansard: Array.from(this.references.hansard),
            quotedText: this.references.quotedText
        };
    }

    static MemberReference = class {
      constructor(node) {
        const content = node.textContent.trim();
        this.personId = node.getAttribute('person_id');
        
        // Parse name and role/constituency
        const match = content.match(/([^(]+)(?:\s*\(([^)]+)\))?/);
        if (match) {
          this.name = match[1].trim();
          this.role = match[2]?.trim() || null;
        } else {
          this.name = content;
          this.role = null;
        }
      }

      toJSON() {
        return {
          id: this.personId,
          name: this.name,
          role: this.role
        };
      }
    }
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
      interventions: speech.interventions,
      division: speech.division ? {
        counts: speech.division.counts,
        number: speech.division.number,
        result: speech.division.counts.ayes > speech.division.counts.noes ? 'PASSED' : 'REJECTED',
        participation: speech.division.counts.ayes + speech.division.counts.noes,
        margin: Math.abs(speech.division.counts.ayes - speech.division.counts.noes)
      } : null,
      quoted_text: speech.quotedText ? speech.quotedText.map(quote => ({
        text: quote.text,
        type: quote.type,
        pid: quote.pid
      })) : null
    };
  }


// Core classes
class ParliamentaryContext {
    constructor() {
      this.speakers = new Set();
      this.timing = {
        currentTime: null,
        currentColumn: null
      };
      this.procedural = {
        currentStandingOrder: null,
        motionStatus: null,
        votingStatus: null,
        amendments: [],
        divisions: []
      };
      
      // Reference tracking
      this.references = {
        members: new Map(), // Changed to Map for deduplication by ID
        dates: new Set(),
        bills: new Set(),
        standingOrders: new Set(),
        hansard: new Set(),
        quotedText: []
      };
      
      // Lords-specific tracking
      this.isLords = false;
      this.lordsOfficers = new Set(['Lord Speaker', 'Senior Deputy Speaker']);
      this.ministerialTeam = new Map();
    }
  
    updateContext(node) {
      // Skip if not a valid node
      if (!node || node.nodeType !== NODE_TYPES.ELEMENT_NODE) {
        return;
      }

      try {
        // Update timing context
        this.updateTiming(node);
        
        // Process references
        this.processReferences(node);
        
        // Process speaker IDs
        const speakerId = node.getAttribute('person_id');
        if (speakerId) {
          this.speakers.add(speakerId);
        }

        // Handle Lords-specific attributes
        if (node.getAttribute('house') === 'lords') {
          this.processLordsNode(node);
        }

      } catch (error) {
        console.warn(`Error processing node in ParliamentaryContext: ${error.message}`);
      }
    }

    updateTiming(node) {
      // Update time if present
      const time = node.getAttribute('time');
      if (time) {
        this.timing.currentTime = time;
      }

      // Update column number if present
      const colnum = node.getAttribute('colnum');
      if (colnum) {
        this.timing.currentColumn = parseInt(colnum);
      }
    }

    processReferences(node) {
      // Process member references
      if (node.getAttribute('person_id')) {
        try {
          const memberRef = new MemberReference(node);
          this.references.members.set(memberRef.personId, memberRef.toJSON());
        } catch (error) {
          console.warn('Error processing member reference:', error);
        }
      }

      // Process date references
      if (node.getAttribute('time') || node.classList?.contains('date')) {
        try {
          const dateRef = new DateReference(node);
          if (dateRef.date) {
            this.references.dates.add(dateRef.toJSON());
          }
        } catch (error) {
          console.warn('Error processing date reference:', error);
        }
      }

      // Process phrase-based references
      if (node.tagName === 'phrase') {
        switch(node.getAttribute('class')) {
          case 'honfriend':
          case 'member':
            try {
              const memberRef = new MemberReference(node);
              this.references.members.set(memberRef.personId, memberRef.toJSON());
            } catch (error) {
              console.warn('Error processing member phrase:', error);
            }
            break;
            
          case 'date':
            try {
              const dateRef = new DateReference(node);
              if (dateRef.date) {
                this.references.dates.add(dateRef.toJSON());
              }
            } catch (error) {
              console.warn('Error processing date phrase:', error);
            }
            break;

          case 'bill':
            this.references.bills.add(node.textContent.trim());
            break;

          case 'standing-order':
            this.references.standingOrders.add(node.textContent.trim());
            break;
        }
      }

      // Process quoted text
      if (node.getAttribute('pwmotiontext') === 'yes' || 
          node.classList?.contains('indent')) {
        this.references.quotedText.push({
          text: node.textContent.trim(),
          type: this.determineQuoteType(node),
          pid: node.getAttribute('pid'),
          time: this.timing.currentTime,
          column: this.timing.currentColumn
        });
      }
    }

    determineQuoteType(node) {
      const text = node.textContent.toLowerCase();
      const classes = node.getAttribute('class') || '';
      
      if (text.includes('motion made') || text.includes('question put')) {
        return 'PROCEDURAL_MOTION';
      }
      if (text.includes('amendment proposed')) {
        return 'AMENDMENT';
      }
      if (text.includes('division')) {
        return 'DIVISION_RESULT';
      }
      if (text.includes('standing order')) {
        return 'STANDING_ORDER';
      }
      if (classes.includes('indent')) {
        return 'DIRECT_QUOTE';
      }
      return 'OTHER';
    }

    processLordsNode(node) {
      const role = node.getAttribute('member_role');
      if (role) {
        this.processLordsMemberRole(role, node);
      }
    }

    processLordsMemberRole(role, node) {
      if (role.includes('Minister') || 
          role.includes('Secretary of State') ||
          role.includes('Lord Speaker')) {
        const memberId = node.getAttribute('person_id');
        if (memberId) {
          this.ministerialTeam.set(memberId, role);
        }
      }
    }

    getCurrentContext() {
      return {
        timing: { ...this.timing },
        speakers: Array.from(this.speakers),
        references: {
          members: Array.from(this.references.members.values()),
          dates: Array.from(this.references.dates),
          bills: Array.from(this.references.bills),
          standingOrders: Array.from(this.references.standingOrders),
          hansard: Array.from(this.references.hansard),
          quotedText: this.references.quotedText
        },
        isLords: this.isLords,
        ministerialTeam: Array.from(this.ministerialTeam.entries())
      };
    }
}
  
  class DivisionProcessor {
    constructor() {
      this.currentDivision = null;
      this.divisions = [];
    }
  
    processDivision(node) {
      if (node.nodeName !== 'division') return;
  
      const divisionCount = Array.from(node.getElementsByTagName('divisioncount'))[0];
      if (!divisionCount) return;
  
      // Align with database schema
      const division = {
        id: `div_${node.getAttribute('id')}`,
        business_item_id: null, // Set by parent business
        division_number: parseInt(node.getAttribute('divnumber')),
        time: node.getAttribute('time'),
        subject: this.extractSubject(node),
        motion_text: this.extractMotionText(node),
        
        // Results aligned with schema
        ayes_count: parseInt(divisionCount.getAttribute('ayes')) || 0,
        noes_count: parseInt(divisionCount.getAttribute('noes')) || 0,
        
        // Detailed voting records
        votes: this.extractVotes(node),
        tellers: this.extractTellers(node),
      };
  
      this.divisions.push(division);
      return division;
    }
  
    extractVotes(node) {
      return {
        ayes: this.extractVoterList(node, 'aye'),
        noes: this.extractVoterList(node, 'no')
      };
    }
  
    extractVoterList(node, voteType) {
      // Convert HTMLCollection to Array and find matching list
      const lists = Array.from(node.getElementsByTagName('mplist'));
      const list = lists.filter(list => list.getAttribute('vote') === voteType)[0];
      
      if (!list) return [];
  
      // Convert HTMLCollection to Array for member names
      return Array.from(list.getElementsByTagName('mpname'))
        .map(mp => ({
          member_id: mp.getAttribute('person_id'),
          name: mp.textContent.trim(),
          is_teller: mp.getAttribute('teller') === 'yes'
        }));
    }
  
    extractTellers(node) {
      const tellers = {
        ayes: [],
        noes: []
      };
  
      ['aye', 'no'].forEach(voteType => {
        // Convert HTMLCollection to Array before filtering
        const lists = Array.from(node.getElementsByTagName('mplist'));
        const list = lists.filter(list => list.getAttribute('vote') === voteType)[0];
        
        if (list) {
          // Convert HTMLCollection to Array for member names
          Array.from(list.getElementsByTagName('mpname'))
            .filter(mp => mp.getAttribute('teller') === 'yes')
            .forEach(mp => {
              tellers[voteType === 'aye' ? 'ayes' : 'noes'].push({
                member_id: mp.getAttribute('person_id'),
                name: mp.textContent.trim()
              });
            });
        }
      });
  
      return tellers;
    }
  
    extractSubject(node) {
      // Look for motion text or preceding heading
      const motionNode = node.previousElementSibling;
      if (motionNode?.getAttribute('pwmotiontext') === 'yes') {
        return motionNode.textContent.trim();
      }
      return null;
    }
  
    extractMotionText(node) {
      const motions = [];
      let current = node.previousElementSibling;
      
      // Look back through previous siblings for motion text
      while (current && motions.length < 3) {
        if (current.getAttribute('pwmotiontext') === 'yes') {
          motions.unshift(current.textContent.trim());
        }
        current = current.previousElementSibling;
      }
      
      return motions.join('\n');
    }
  }

  class ParliamentaryBusiness {
    constructor(type, metadata = {}) {
        this.type = type;
        this.metadata = metadata;
        
        // Basic tracking
        this.speeches = [];
        this.children = [];
        this.parent = null;
        this.procedural = [];
        this.references = {
            members: new Map(),
            dates: new Set(),
            bills: new Set(),
            standingOrders: new Set(),
            hansard: new Set(),
            quotedText: []
        };
        this.divisions = [];

        // Enhanced temporal tracking
        this.timing = {
            start_time: null,
            end_time: null,
            duration: null
        };
        this.sequence = [];

        // Enhanced member tracking
        this.membersSpeaking = new Set();
        this.memberInterventions = new Map();
        this.speakingOrder = [];

        // Enhanced lead minister tracking
        this.leadMinister = null;
        this.pendingRole = null;
        this.lastSpeakerCall = null;
        
        // Debug flags
        this.debug = metadata.debug || true;

        // Add specific tracking for speaker calls
        this.pendingSpeakerCall = null;
        this.lastSpeakerRole = null;
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

    finalize() {
        return {
            type: this.type,
            metadata: this.metadata,
            timing: {
                start_time: this.timing.start_time,
                end_time: this.timing.end_time,
                duration: this.timing.duration
            },
            participation: {
                totalSpeeches: this.speeches.length,
                uniqueSpeakers: Array.from(this.membersSpeaking),
                speakingOrder: this.speakingOrder,
                interventions: Array.from(this.memberInterventions.entries())
            },
            references: {
                ...this.references,
                quotedText: this.quotedText,
                hansard: this.hansardReferences
            },
            speeches: this.speeches,
            divisions: this.divisions,
            procedural: this.procedural,
            // Add lead minister data to output
            lead_minister: this.leadMinister ? {
                id: this.leadMinister.id,
                name: this.leadMinister.name,
                role: this.leadMinister.role
            } : null
        };
    }

    calculateDuration(start, end) {
        if (!start || !end) return null;
        
        // Convert times to minutes since midnight
        const startParts = start.split(':').map(Number);
        const endParts = end.split(':').map(Number);
        
        const startMins = (startParts[0] * 60) + startParts[1];
        const endMins = (endParts[0] * 60) + endParts[1];
        
        // Handle cases where debate goes past midnight
        let duration = endMins - startMins;
        if (duration < 0) {
            duration += 24 * 60; // Add 24 hours worth of minutes
        }
        
        return duration;
    }

    processMemberReference(node) {
        // Extract member info from node text
        const content = node.textContent.trim();
        
        // Handle standing committee member format: Name_(Constituency)_(Party)
        const standingMatch = content.match(/([^_]+)(?:_\(([^)]+)\))?(?:_\(([^)]+)\))?/);
        if (standingMatch) {
            const [_, name, constituency, party] = standingMatch;
            const member = {
                name: name.trim(),
                constituency: constituency?.trim() || null,
                party: party?.trim() || null,
                personId: node.getAttribute('person_id') || null
            };
            
            // Add to references if not already present
            if (!this.references.members.some(m => m.name === member.name)) {
                this.references.members.push(member);
            }
            
            return member;
        }

        // Handle standard format
        const standardMatch = content.match(/([^(]+)(?:\s*\(([^)]+)\))?/);
        if (standardMatch) {
            const [_, name, role] = standardMatch;
            const member = {
                name: name.trim(),
                role: role?.trim() || null,
                personId: node.getAttribute('person_id') || null
            };
            
            if (!this.references.members.some(m => m.name === member.name)) {
                this.references.members.push(member);
            }
            
            return member;
        }

        return null;
    }

    // Add generalized member tracking method
    trackMemberContribution(speech) {
        if (!speech.speakerId || !speech.speakerName) return;

        // Initialize member stats if needed
        if (!this.memberTracking.contributions.has(speech.speakerId)) {
            this.memberTracking.contributions.set(speech.speakerId, {
                name: speech.speakerName,
                speechCount: 0,
                interventionCount: 0,
                firstContribution: speech.time
            });
            this.memberTracking.speakingOrder.push(speech.speakerId);
        }

        const stats = this.memberTracking.contributions.get(speech.speakerId);
        
        // Update stats based on speech type
        switch (speech.type) {
            case 'Start Speech':
                stats.speechCount++;
                this.memberTracking.speaking.add(speech.speakerId);
                break;
            case 'Start Intervention':
                stats.interventionCount++;
                this.trackIntervention(speech);
                break;
        }
    }

    // Add generalized intervention tracking
    trackIntervention(speech) {
        const currentSpeaker = this.memberTracking.speakingOrder[
            this.memberTracking.speakingOrder.length - 1
        ];
        
        if (currentSpeaker) {
            if (!this.memberTracking.interventions.has(speech.speakerId)) {
                this.memberTracking.interventions.set(speech.speakerId, new Set());
            }
            this.memberTracking.interventions.get(speech.speakerId).add(currentSpeaker);
        }
    }

    // Add method to format references for DB
    formatReferencesForDB() {
        return {
            members: Array.from(this.references.members.values()),
            dates: Array.from(this.references.dates),
            bills: Array.from(this.references.bills),
            standingOrders: Array.from(this.references.standingOrders),
            hansard: Array.from(this.references.hansard),
            quotedText: this.references.quotedText
        };
    }

    isValidTimeFormat(time) {
        // Validate HH:MM:SS or HH:MM format
        return /^([0-1][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(time);
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

        // Add Lords-specific tracking
        this.isLords = metadata.isLords || false;
        this.questionText = null;  // Full question text for Lords
        this.ministerialResponse = null;
        this.supplementaryQuestions = [];
    }

    processSpeech(speech) {
        if (this.isLords) {
            if (speech.type === 'Question') {
                this.questionText = speech.content;
            } else if (!this.ministerialResponse && speech.member?.role?.includes('Minister')) {
                this.ministerialResponse = speech;
            } else {
                this.supplementaryQuestions.push(speech);
            }
        }
        // Track grouped questions (questions with same text asked by multiple MPs)
        if (speech.type === 'Start Question') {
          const questionText = speech.content.trim();
          if (!this.groupedQuestions.has(questionText)) {
            this.groupedQuestions.set(questionText, []);
          }
          this.currentGroupedQuestionId = questionText;
          this.groupedQuestions.get(questionText).push(speech);
        }

        // Add special handling for "I call" speeches
        if (speech.content?.includes('I call')) {
          // Extract the role from "I call the shadow Minister" or similar
          const roleMatch = speech.content.match(/I call (?:the )?([^.(]+)/i);
          if (roleMatch) {
              this.pendingSpeakerCall = {
                  time: speech.time,
                  role: roleMatch[1].trim(),
                  speakerId: speech.speakerId,
                  speakerName: speech.speakerName
              };
          }
          return; // Don't process this as a regular speech
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

// Add these classes at the top level of the file
class DateReference {
  constructor(node) {
    const content = node.textContent.trim();
    this.date = this.parseDate(content);
    this.originalText = content;
  }

  parseDate(text) {
    // Handle common date formats
    const dateMatch = text.match(/\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i);
    if (dateMatch) {
      return dateMatch[1];
    }
    return null;
  }

  toJSON() {
    return {
      date: this.date,
      text: this.originalText
    };
  }
}

class MemberReference {
  constructor(node) {
    const content = node.textContent.trim();
    this.personId = node.getAttribute('person_id');
    
    // Parse name and role/constituency
    const match = content.match(/([^(]+)(?:\s*\(([^)]+)\))?/);
    if (match) {
      this.name = match[1].trim();
      this.role = match[2]?.trim() || null;
    } else {
      this.name = content;
      this.role = null;
    }

    // If there's a pending speaker call and this is the next speech,
    // assign the role from the call
    if (this.pendingSpeakerCall && speech.speakerId) {
        speech.role = this.pendingSpeakerCall.role;
        this.lastSpeakerRole = this.pendingSpeakerCall.role;
        this.pendingSpeakerCall = null;
    }
  }

  toJSON() {
    return {
      id: this.personId,
      name: this.name,
      role: this.role,
      party: this.party,
      constituency: this.constituency
    };
  }
}
// Update the exports
module.exports = {
    ParliamentaryBusiness,  // Add this
    ParliamentaryProcessor,
    QuestionTimeSection,
    DivisionProcessor,
    SHARED_BUSINESS_TYPES,
    NODE_TYPES,
    MemberReference,
    DateReference,
    ParliamentaryContext
};

