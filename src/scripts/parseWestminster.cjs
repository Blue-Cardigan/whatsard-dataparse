const { 
  ParliamentaryProcessor, 
  ParliamentaryBusiness 
} = require('./parseCommons.cjs');

class WestminsterHallBusiness extends ParliamentaryBusiness {
  constructor(type, metadata = {}) {
    super(type, metadata);
    this.chair = null;
    this.debateStart = null;
    this.debateEnd = null;
    this.timeAllocation = null; // For storing 30min/60min/90min/3hr allocation
    this.speakingTimeWarnings = []; // Track chair's time warnings
    this.memberSpeakingTimes = new Map(); // Track cumulative time per member
  }

  // Add time tracking methods
  setDebateTime(startTime, endTime) {
    this.debateStart = startTime;
    this.debateEnd = endTime;
  }

  setTimeAllocation(minutes) {
    this.timeAllocation = minutes;
  }

  addSpeakingTimeWarning(time, message) {
    this.speakingTimeWarnings.push({ time, message });
  }

  updateMemberSpeakingTime(memberId, duration) {
    const currentTime = this.memberSpeakingTimes.get(memberId) || 0;
    this.memberSpeakingTimes.set(memberId, currentTime + duration);
  }

  setChair(chairInfo) {
    this.chair = {
      member_id: chairInfo.member_id,
      member_name: chairInfo.member_name,
      start_time: chairInfo.start_time,
      interventions: []
    };
  }
}

class WestminsterHallProcessor extends ParliamentaryProcessor {
  constructor(config = {}) {
    super(config);
    this.currentChair = null;
    this.context.participations = [];
    this.lastSpeechTime = null;
  }

  processMinorHeading(node) {
    const content = node.textContent.trim();
    
    // Extract chair information from Westminster Hall heading
    const chairMatch = content.match(/\[(.*?)in the Chair\]/);
    if (chairMatch) {
      const chairName = chairMatch[1].trim();
      
      // Create new business item for the debate
      const type = {
        category: 'WESTMINSTER',
        type: 'DEBATE',
      };
      
      this.finalizeCurrentBusiness();
      
      this.currentBusiness = new WestminsterHallBusiness(type, {
        id: node.getAttribute('id'),
        title: content.replace(/\[.*?in the Chair\]/, '').trim()
      });

      // Set chair information
      this.currentBusiness.setChair({
        member_name: chairName,
        start_time: node.getAttribute('time') || null,
        member_id: node.getAttribute('person_id')
      });

      // Look ahead for debate format and time allocation
      this.determineDebateFormat(node);
    } else if (this.currentBusiness) {
      // Update title for subsequent headings that might contain the actual debate topic
      if (content.includes('That this House has considered')) {
        this.currentBusiness.metadata.title = content.trim();
      }
    }
  }

  determineDebateFormat(headingNode) {
    // Look ahead to next nodes to find debate format indicators
    let nextNode = headingNode.nextElementSibling;
    let found = false;
    
    while (nextNode && !found) {
      const content = nextNode.textContent.trim();
      
      // Check for time allocation markers
      const timeMatch = content.match(/(\d+)[-\s]minute|(\d+)[-\s]hour/i);
      if (timeMatch) {
        const minutes = timeMatch[1] ? 
          parseInt(timeMatch[1]) : 
          parseInt(timeMatch[2]) * 60;
        
        this.currentBusiness.setTimeAllocation(minutes);
        found = true;
      }
      
      // Check for debate motion
      if (content.includes('I beg to move') && 
          content.includes('That this House has considered')) {
        this.currentBusiness.type = {
          ...this.currentBusiness.type,
          subType: 'GENERAL'
        };
        found = true;
      }
      
      nextNode = nextNode.nextElementSibling;
    }

    // Default to 90 minutes if no specific allocation found
    if (!this.currentBusiness.timeAllocation) {
      this.currentBusiness.setTimeAllocation(90);
    }
  }

  determineBusinessType(node) {
    const content = node.textContent.trim();
    
    if (content.includes('in the Chair')) {
      // Westminster Hall debate indicator
      return {
        category: 'WESTMINSTER',
        type: 'DEBATE',
        subType: 'GENERAL' // Will be refined in determineDebateFormat
      };
    }

    return super.determineBusinessType(node);
  }

  createBusinessInstance(type, metadata) {
    if (type.category === 'WESTMINSTER') {
      return new WestminsterHallBusiness(type, metadata);
    }
    return super.createBusinessInstance(type, metadata);
  }

  shouldCreateNewBusiness(type, content) {
    if (content.includes('in the Chair')) {
      // Always create new business for Westminster Hall debates
      return true;
    }
    return super.shouldCreateNewBusiness(type, content);
  }

  addParticipation(businessItemId, member) {
    const participation = {
      business_item_id: businessItemId,
      member_id: member.member_id,
      member_name: member.member_name,
      roles: member.roles || [{ role: "participant" }],
      is_chair: member.is_chair || false,
      is_minister: member.is_minister || false,
      contribution_count: 0,
      contribution_types: { speeches: 0, interventions: 0 }
    };

    this.context.participations.push(participation);
  }

  processTimeAttribute(node) {
    const timeStr = node.getAttribute('time');
    if (!timeStr) return null;
    
    // Convert time string (HH:MM:SS) to Date object
    const [hours, minutes, seconds] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, seconds);
    return date;
  }

  processSpeech(node) {
    if (!this.currentBusiness) return;

    const speech = this.extractSpeech(node);
    const speechTime = this.processTimeAttribute(node);

    // Calculate duration if we have previous speech time
    if (speechTime && this.lastSpeechTime) {
      const duration = speechTime - this.lastSpeechTime;
      if (speech.speakerId) {
        this.currentBusiness.updateMemberSpeakingTime(speech.speakerId, duration);
      }
    }

    // Track time limits and warnings from Chair
    if (speech.isChairSpeech) {
      const timeWarningMatch = speech.content?.match(/(\d+)[- ]minute/i);
      if (timeWarningMatch) {
        this.currentBusiness.addSpeakingTimeWarning(speechTime, speech.content);
      }
    }

    this.lastSpeechTime = speechTime;

    // Update participation with timing information
    this.updateParticipation(speech, speechTime);

    // If this is the first speech, set debate start time
    if (!this.currentBusiness.debateStart) {
      this.currentBusiness.setDebateTime(speechTime, null);
    }

    super.processSpeech(node);
  }

  updateParticipation(speech, time) {
    if (!speech.speakerId) return;

    const participation = this.context.participations.find(p => 
      p.business_item_id === this.currentBusiness.id && 
      p.member_id === speech.speakerId
    );

    if (participation) {
      participation.contribution_count++;
      participation.last_contribution_time = time;
      
      if (!participation.first_contribution_time) {
        participation.first_contribution_time = time;
      }

      if (speech.role === 'chair') {
        participation.contribution_types.chair_interventions = 
          (participation.contribution_types.chair_interventions || 0) + 1;
      } else if (speech.type === 'intervention') {
        participation.contribution_types.interventions++;
      } else {
        participation.contribution_types.speeches++;
      }
    } else {
      this.addParticipation(this.currentBusiness.id, {
        member_id: speech.speakerId,
        member_name: speech.speakerName,
        roles: [{
          role: speech.role || "participant",
          start_time: time
        }],
        first_contribution_time: time,
        last_contribution_time: time
      });
    }
  }

  finalizeCurrentBusiness() {
    if (this.currentBusiness) {
      // Set debate end time
      if (this.lastSpeechTime) {
        this.currentBusiness.setDebateTime(
          this.currentBusiness.debateStart,
          this.lastSpeechTime
        );
      }
      
      // Calculate total debate duration
      if (this.currentBusiness.debateStart && this.currentBusiness.debateEnd) {
        this.currentBusiness.totalDuration = 
          this.currentBusiness.debateEnd - this.currentBusiness.debateStart;
      }
    }
    
    super.finalizeCurrentBusiness();
  }
}

module.exports = {
  WestminsterHallProcessor,
  WestminsterHallBusiness
};