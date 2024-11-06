const { 
  ParliamentaryBusiness, 
  ParliamentaryProcessor, 
  SHARED_BUSINESS_TYPES,
  NODE_TYPES
} = require('./parliamentaryBusiness.cjs');

// Add Westminster Hall specific business types
const WESTMINSTER_HALL_TYPES = {
  DEBATES: {
    GENERAL: {
      markers: ['That this House has considered']
    },
    PETITIONS: {
      markers: ['e-petition']
    }
  },
  ADJOURNMENT: {
    markers: ['Adjournment']
  }
};

// Add Westminster Hall specific constants
const WESTMINSTER_HALL_MARKERS = {
  CHAIR_INTRO: ['in the Chair', 'chairmanship'],
  TIME_LIMIT: ['will not be an opportunity', 'as is the convention'],
  MOTION_START: ['I beg to move', 'That this House has considered'],
  INTERVENTIONS: ['I thank my hon. Friend', 'Will my hon. Friend give way'],
  CHAIR_REMARKS: ['Order', 'Keep an eye on the clock'],
  CLOSING: ['Question put and agreed to', 'Sitting adjourned']
};

class WestminsterHallDebate extends ParliamentaryBusiness {
  constructor(metadata = {}) {
    super({ category: 'WESTMINSTER_HALL', type: 'DEBATE' }, metadata);
    
    // Basic debate tracking
    this.chair = null;
    this.leadMember = null;
    this.minister = null;
    this.membersSpeaking = new Set();
    this.totalTime = 0;
    this.resolved = false;

    // Enhanced timing tracking
    this.actualStartTime = null;
    this.actualEndTime = null;
    this.imposedTimeLimits = [];

    // Enhanced speech type tracking
    this.speechTypes = {
      mainSpeeches: [],
      interventions: [],
      continuations: [],
      chairRemarks: [],
      pointsOfOrder: []
    };

    // Enhanced member tracking
    this.members = this.memberTracking.contributions;
    this.speakingOrder = this.memberTracking.speakingOrder;
    this.interventionsByMember = this.memberTracking.interventions;

    // Enhanced motion tracking
    this.mainMotion = null;
    this.resolution = null;

    // Enhanced reference tracking
    this.hansardReferences = [];
    this.memberReferences = new Set();
    this.dateReferences = new Set();
  }

  extractTimeLimit(content) {
    const timeMatch = content.match(/(\d+)(?:-minute|minutes?|mins?)/i);
    return timeMatch ? parseInt(timeMatch[1]) : null;
  }

  extractResolution(speech) {
    const resolutionMatch = speech.content?.match(/Resolved,\s*([^.]+\.)/);
    return resolutionMatch ? resolutionMatch[1].trim() : null;
  }

  extractMotionText(speech) {
    if (speech.nodeType) {
      // DOM node processing
      const motionParagraphs = Array.from(speech.getElementsByTagName('p'))
        .filter(p => p.getAttribute('pwmotiontext') === 'yes');
      return motionParagraphs.map(p => p.textContent).join(' ');
    } else {
      // Plain object processing
      const motionMatch = speech.content?.match(/That this House[^.]+\./);
      return motionMatch ? motionMatch[0].trim() : null;
    }
  }

  processSpeech(speech) {
    super.processSpeech(speech);

    // Track timing
    if (speech.time) {
      if (!this.actualStartTime) this.actualStartTime = speech.time;
      this.actualEndTime = speech.time;
    }

    // Track speech types
    if (speech.type) {
      switch(speech.type) {
        case 'Start Speech':
          this.speechTypes.mainSpeeches.push({
            id: speech.speakerId,
            time: speech.time,
            content: speech.content
          });
          break;
        case 'Start Intervention':
          this.speechTypes.interventions.push({
            id: speech.speakerId,
            time: speech.time,
            content: speech.content
          });
          break;
        case 'Continuation Speech':
          this.speechTypes.continuations.push({
            id: speech.speakerId,
            time: speech.time,
            content: speech.content
          });
          break;
        case 'Continuation Chair':
          this.chair = {
            name: speech.speakerName,
            id: speech.speakerId
          };
          
          if (speech.content?.includes('time limit')) {
            this.imposedTimeLimits.push({
              time: speech.time,
              limit: this.extractTimeLimit(speech.content)
            });
          }
          break;
        case 'Start PointOfOrder':
          this.speechTypes.pointsOfOrder.push({
            id: speech.speakerId,
            time: speech.time,
            content: speech.content
          });
          break;
      }
    }

    // Track member details
    if (speech.speakerId && speech.speakerName) {
      if (!this.members.has(speech.speakerId)) {
        this.members.set(speech.speakerId, {
          name: speech.speakerName,
          speechCount: 0,
          interventionCount: 0,
          firstContribution: speech.time
        });
        this.speakingOrder.push(speech.speakerId);
      }

      const memberStats = this.members.get(speech.speakerId);
      if (speech.type === 'Start Speech') {
        memberStats.speechCount++;
      } else if (speech.type === 'Start Intervention') {
        memberStats.interventionCount++;
        
        // Track intervention target if available
        const currentSpeaker = this.speakingOrder[this.speakingOrder.length - 1];
        if (currentSpeaker) {
          if (!this.interventionsByMember.has(speech.speakerId)) {
            this.interventionsByMember.set(speech.speakerId, new Set());
          }
          this.interventionsByMember.get(speech.speakerId).add(currentSpeaker);
        }
      }
    }

    // Track lead member and minister
    if (!this.leadMember && speech.type === 'Start Speech' && 
        speech.content?.includes('beg to move')) {
      this.leadMember = {
        name: speech.speakerName,
        id: speech.speakerId
      };
    }

    if (speech.type === 'Start Answer') {
      this.minister = {
        name: speech.speakerName,
        id: speech.speakerId
      };
    }

    // Track motion and resolution
    if (speech.content?.includes('That this House') && !this.mainMotion) {
      this.mainMotion = this.extractMotionText(speech);
    }

    if (speech.content?.includes('Resolved,')) {
      this.resolution = this.extractResolution(speech);
      this.resolved = true;
    }

    // Track references
    if (speech.references) {
      if (speech.references.members?.length) {
        speech.references.members.forEach(member => {
          this.memberReferences.add(member);
        });
      }
      if (speech.references.dates?.length) {
        speech.references.dates.forEach(date => {
          this.dateReferences.add(date);
        });
      }
    }
  }
}

class WestminsterHallProcessor extends ParliamentaryProcessor {
  constructor(config = {}) {
    super(config);
    this.businessTypes = {
      ...SHARED_BUSINESS_TYPES,
      ...WESTMINSTER_HALL_TYPES
    };
    this.chairPerson = null;
    this.timeLimit = null;
    this.debate = {
        title: null,
        chair: null,
        timeLimit: null,
        mainMotion: null,
        interventions: [],
        memberContributions: new Map(), // Track speaking time per member
        statistics: {
            totalInterventions: 0,
            totalSpeakers: 0,
            averageSpeakingTime: 0
        }
    };
  }

  processMinorHeading(node) {
    // Westminster Hall headings include chair information
    const heading = {
      id: node.getAttribute('id'),
      text: node.textContent,
      chair: this.extractChairInfo(node.textContent)
    };

    if (this.currentBusiness) {
      this.currentBusiness.metadata.minorHeadings =
        this.currentBusiness.metadata.minorHeadings || [];
      this.currentBusiness.metadata.minorHeadings.push(heading);
    }
    
    // Start new debate section
    this.startNewDebate(heading);
  }

  startNewDebate(heading) {
    this.finalizeCurrentBusiness();
    
    const metadata = {
      id: heading.id,
      title: this.cleanHeading(heading.text),
      chair: heading.chair
    };

    this.currentBusiness = new WestminsterHallDebate(metadata);
  }

  extractChairInfo(text) {
    const chairMatch = text.match(/\[(.*?) in the Chair\]/);
    return chairMatch ? chairMatch[1].trim() : null;
  }

  cleanHeading(text) {
    // Remove chair info and normalize
    return text.replace(/\[.*?in the Chair\]/, '')
      .replace(/—/g, '')
      .trim();
  }

  getDuration(start, end) {
    if (!start || !end) return null;
    
    const startTime = new Date(`1970-01-01T${start}`);
    const endTime = new Date(`1970-01-01T${end}`);
    return (endTime - startTime) / 1000 / 60; // Minutes
  }

  getSummaryStats() {
    return {
      totalDebates: this.allBusiness.length,
      totalSpeakers: new Set(
        this.allBusiness.flatMap(b => Array.from(b.membersSpeaking))
      ).size,
      totalInterventions: this.allBusiness.reduce(
        (sum, b) => sum + b.interventions.length, 0
      ),
      debatesByType: this.getDebateTypes(),
      averageDuration: this.getAverageDuration()
    };
  }

  getDebateTypes() {
    const types = {};
    this.allBusiness.forEach(b => {
      const type = b.type.type;
      types[type] = (types[type] || 0) + 1;
    });
    return types;
  }

  getAverageDuration() {
    const durations = this.allBusiness
      .map(b => this.getDuration(b.speeches[0]?.time, 
                                b.speeches[b.speeches.length-1]?.time))
      .filter(d => d);
    
    return durations.length ? 
      durations.reduce((a,b) => a + b, 0) / durations.length : 
      null;
  }

  processNode(node) {
      if (!node || node.nodeType !== NODE_TYPES.ELEMENT_NODE) {
          return;
      }

      try {
          // Extract chair information
          if (this.matchesMarkers(node.textContent, WESTMINSTER_HALL_MARKERS.CHAIR_INTRO)) {
              const chairMatch = node.textContent.match(/\[(.*?) in the Chair\]/);
              if (chairMatch) {
                  this.chairPerson = chairMatch[1].trim();
              }
          }

          // Extract time limit information 
          if (this.matchesMarkers(node.textContent, WESTMINSTER_HALL_MARKERS.TIME_LIMIT)) {
              this.timeLimit = node.textContent.trim();
          }

          // Process motion
          if (this.matchesMarkers(node.textContent, WESTMINSTER_HALL_MARKERS.MOTION_START)) {
              this.processMotion(node);
          }

          // Add new processing logic
          if (this.isDebateTitle(node)) {
              this.debate.title = this.extractDebateTitle(node);
          }

          if (this.isIntervention(node)) {
              this.processIntervention(node);
          }

          if (this.isChairRemark(node)) {
              this.processChairRemark(node);
          }

          super.processNode(node);
      } catch (error) {
          console.warn(`Error processing Westminster Hall node: ${error.message}`);
      }
  }

  processMotion(node) {
      const motion = {
          text: node.textContent.trim(),
          proposer: this.context.currentSpeaker,
          time: this.context.timing.currentTime
      };
      
      if (this.currentBusiness) {
          this.currentBusiness.metadata.motion = motion;
      }
  }

  processIntervention(node) {
      const intervention = {
          member: this.context.currentSpeaker,
          time: this.context.timing.currentTime,
          content: node.textContent.trim(),
          responseFrom: this.context.previousSpeaker
      };
      this.debate.interventions.push(intervention);
      this.debate.statistics.totalInterventions++;
  }

  processChairRemark(node) {
      // Implement chair remarks processing logic
  }

  isDebateTitle(node) {
      // Implement debate title detection logic
      return false;
  }

  extractDebateTitle(node) {
      // Implement debate title extraction logic
      return null;
  }

  isIntervention(node) {
      // Implement intervention detection logic
      return false;
  }

  isChairRemark(node) {
      // Implement chair remarks detection logic
      return false;
  }
}

module.exports = {
  WestminsterHallProcessor,
  WestminsterHallDebate,
  WESTMINSTER_HALL_TYPES
};