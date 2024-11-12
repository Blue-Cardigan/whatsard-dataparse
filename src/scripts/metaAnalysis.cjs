const fs = require('fs');
const path = require('path');

function analyzeDebates(outputDir) {
  const summary = {
    analysisDate: new Date().toISOString(),
    commons: {
      filesAnalyzed: 0,
      totalBusinessSections: 0,
      totalSpeeches: 0,
      uniqueSpeakers: new Set(),
      averageDuration: 0,
      businessTypes: new Map(),
      timingPatterns: {
        averageStartTime: [],
        averageEndTime: [],
        averageGapLength: 0,
        totalGaps: 0
      },
      speakerStats: {
        ministerialContributions: 0,
        backbenchContributions: 0,
        interventions: 0
      },
      references: {
        memberRefs: new Set(),
        dateRefs: new Set(),
        billRefs: new Set(),
        quotedTextCount: 0
      }
    },
    lords: {
      // Same structure as commons
      filesAnalyzed: 0,
      totalBusinessSections: 0,
      totalSpeeches: 0,
      uniqueSpeakers: new Set(),
      averageDuration: 0,
      businessTypes: new Map(),
      timingPatterns: {
        averageStartTime: [],
        averageEndTime: [],
        averageGapLength: 0,
        totalGaps: 0
      },
      speakerStats: {
        ministerialContributions: 0,
        backbenchContributions: 0,
        interventions: 0
      },
      references: {
        memberRefs: new Set(),
        dateRefs: new Set(),
        billRefs: new Set(),
        quotedTextCount: 0
      }
    },
    westminhall: {
      // Same structure as commons
      filesAnalyzed: 0,
      totalBusinessSections: 0,
      totalSpeeches: 0,
      uniqueSpeakers: new Set(),
      averageDuration: 0,
      businessTypes: new Map(),
      timingPatterns: {
        averageStartTime: [],
        averageEndTime: [],
        averageGapLength: 0,
        totalGaps: 0
      },
      speakerStats: {
        ministerialContributions: 0,
        backbenchContributions: 0,
        interventions: 0
      },
      references: {
        memberRefs: new Set(),
        dateRefs: new Set(),
        billRefs: new Set(),
        quotedTextCount: 0
      }
    },
    standing: {
      filesAnalyzed: 0,
      totalBusinessSections: 0,
      totalSpeeches: 0,
      uniqueSpeakers: new Set(),
      averageDuration: 0,
      businessTypes: new Map(),
      timingPatterns: {
        averageStartTime: [],
        averageEndTime: [],
        averageGapLength: 0,
        totalGaps: 0,
        sessionsPerDay: new Map()
      },
      speakerStats: {
        ministerialContributions: 0,
        backbenchContributions: 0,
        interventions: 0,
        chairs: new Set()
      },
      committeeStats: {
        amendments: {
          proposed: 0,
          agreed: 0,
          disagreed: 0,
          withdrawn: 0
        },
        clauses: {
          considered: new Set(),
          debateTime: new Map(),
          votes: new Map()
        },
        divisions: [],
        attendance: new Map()
      },
      references: {
        memberRefs: new Set(),
        dateRefs: new Set(),
        billRefs: new Set(),
        quotedTextCount: 0
      }
    }
  };

  // Process all files
  const files = fs.readdirSync(outputDir)
    .filter(f => f.match(/\d{4}-\d{2}-\d{2}-(commons|lords|westminhall|standing)\.json$/));

  files.forEach(file => {
    const type = file.includes('lords') ? 'lords' : 
                file.includes('westminhall') ? 'westminhall' : 
                file.includes('standing') ? 'standing' : 'commons';
    const stats = summary[type];
    const content = JSON.parse(fs.readFileSync(path.join(outputDir, file), 'utf8'));

    if (type === 'standing') {
      processStandingCommittee(content, stats, type);
    } else {
      processRegularDebate(content, stats, type);
    }
  });

  // Format for output
  return {
    analysisDate: summary.analysisDate,
    summary: {
      totalFilesAnalyzed: files.length,
      byType: {
        commons: formatTypeStats(summary.commons),
        lords: formatTypeStats(summary.lords),
        westminhall: formatTypeStats(summary.westminhall),
        standing: formatTypeStats(summary.standing)
      }
    }
  };
}

function formatTypeStats(stats) {
  return {
    filesAnalyzed: stats.filesAnalyzed,
    averagePerFile: {
      businessSections: (stats.totalBusinessSections / stats.filesAnalyzed).toFixed(1),
      speeches: (stats.totalSpeeches / stats.filesAnalyzed).toFixed(1),
      uniqueSpeakers: (stats.uniqueSpeakers.size / stats.filesAnalyzed).toFixed(1),
      duration: stats.averageDuration.toFixed(1)
    },
    businessTypes: Object.fromEntries(stats.businessTypes),
    speakerStats: {
      totalUniqueSpeakers: stats.uniqueSpeakers.size,
      ministerialContributions: stats.speakerStats.ministerialContributions,
      backbenchContributions: stats.speakerStats.backbenchContributions,
      interventions: stats.speakerStats.interventions
    },
    references: {
      uniqueMembersReferenced: stats.references.memberRefs.size,
      uniqueDatesReferenced: stats.references.dateRefs.size,
      uniqueBillsReferenced: stats.references.billRefs.size,
      totalQuotes: stats.references.quotedTextCount
    }
  };
}

function isMinisterialTitle(name, type) {
  if (type === 'lords') {
    return /Minister|Secretary|Leader|Chancellor|Speaker/.test(name);
  } else {
    return /Minister|Secretary|Prime Minister|Speaker|Deputy Speaker/.test(name);
  }
}

function processRegularDebate(content, stats, type) {
  // Update basic counts
  stats.filesAnalyzed++;
  stats.totalBusinessSections += content.business.length;
  stats.totalSpeeches += content.metadata.totalSpeeches || 0;
  
  if (content.metadata.duration) {
    stats.averageDuration = 
      (stats.averageDuration * (stats.filesAnalyzed - 1) + content.metadata.duration) / 
      stats.filesAnalyzed;
  }

  // Process metadata-level references first
  if (content.metadata?.references) {
    if (content.metadata.references.members) {
      content.metadata.references.members.forEach(member => {
        if (member.personId) {
          stats.references.memberRefs.add(member.personId);
        }
      });
    }
    if (content.metadata.references.dates) {
      content.metadata.references.dates.forEach(date => {
        stats.references.dateRefs.add(date);
      });
    }
  }

  // Process each business section
  content.business.forEach(section => {
    // Track business types
    const category = section.type?.category || 'UNKNOWN';
    stats.businessTypes.set(
      category, 
      (stats.businessTypes.get(category) || 0) + 1
    );

    // Process section-level references
    if (section.references) {
      // Member references
      if (Array.isArray(section.references.members)) {
        section.references.members.forEach(member => {
          if (member.personId) {
            stats.references.memberRefs.add(member.personId);
          }
        });
      }
      
      // Date references
      if (Array.isArray(section.references.dates)) {
        section.references.dates.forEach(date => {
          stats.references.dateRefs.add(date);
        });
      }

      // Bill references
      if (Array.isArray(section.references.bills)) {
        section.references.bills.forEach(bill => {
          stats.references.billRefs.add(bill);
        });
      }

      // Quoted text count
      if (Array.isArray(section.references.quotedText)) {
        stats.references.quotedTextCount += section.references.quotedText.length;
      }
    }

    // Process speeches
    section.speeches?.forEach(speech => {
      // Track speakers
      if (speech.speaker_id) {
        stats.uniqueSpeakers.add(speech.speaker_id);
      }

      // Track timing
      if (speech.time) {
        stats.timingPatterns.averageStartTime.push(speech.time);
        stats.timingPatterns.averageEndTime.push(speech.time);
      }

      // Track contributions
      if (speech.speaker_name) {
        if (isMinisterialTitle(speech.speaker_name, type)) {
          stats.speakerStats.ministerialContributions++;
        } else {
          stats.speakerStats.backbenchContributions++;
        }
      }

      // Process speech-level references
      if (speech.references) {
        if (Array.isArray(speech.references.members)) {
          speech.references.members.forEach(member => {
            if (member.personId) {
              stats.references.memberRefs.add(member.personId);
            }
          });
        }
        if (Array.isArray(speech.references.dates)) {
          speech.references.dates.forEach(date => {
            stats.references.dateRefs.add(date);
          });
        }
        if (Array.isArray(speech.references.bills)) {
          speech.references.bills.forEach(bill => {
            stats.references.billRefs.add(bill);
          });
        }
      }

      // Track quotes
      if (Array.isArray(speech.quoted_text)) {
        stats.references.quotedTextCount += speech.quoted_text.length;
      }
    });

    // Track interventions
    if (section.interventions?.length) {
      stats.speakerStats.interventions += section.interventions.length;
    }
  });
}

function processStandingCommittee(content, stats, type) {
  // Update basic counts
  stats.filesAnalyzed++;
  stats.totalBusinessSections += content.business.length;
  stats.totalSpeeches += content.metadata.totalSpeeches || 0;

  // Process each business section
  content.business.forEach(section => {
    // Track business types
    const category = section.type?.category || 'UNKNOWN';
    stats.businessTypes.set(
      category, 
      (stats.businessTypes.get(category) || 0) + 1
    );

    // Track session information
    if (section.sessionInfo) {
      const date = section.sessionInfo.date || content.date;
      const sessionsForDay = stats.timingPatterns.sessionsPerDay.get(date) || 0;
      stats.timingPatterns.sessionsPerDay.set(date, sessionsForDay + 1);
      
      if (section.sessionInfo.chair) {
        stats.speakerStats.chairs.add(section.sessionInfo.chair);
      }
    }

    // Process speeches with temporal tracking
    let previousTime = null;
    section.speeches?.forEach(speech => {
      // Track timing and gaps
      if (speech.time) {
        if (previousTime) {
          const gapLength = speech.time - previousTime;
          stats.timingPatterns.averageGapLength = 
            (stats.timingPatterns.averageGapLength * stats.timingPatterns.totalGaps + gapLength) / 
            (stats.timingPatterns.totalGaps + 1);
          stats.timingPatterns.totalGaps++;
        }
        previousTime = speech.time;
      }

      // Track speakers
      if (speech.speaker_id) {
        stats.uniqueSpeakers.add(speech.speaker_id);
      }

      // Track contributions
      if (speech.speaker_name) {
        if (isMinisterialTitle(speech.speaker_name, type)) {
          stats.speakerStats.ministerialContributions++;
        } else {
          stats.speakerStats.backbenchContributions++;
        }
      }

      // Track references
      if (speech.references) {
        speech.references.members?.forEach(member => {
          stats.references.memberRefs.add(member.personId);
        });
        speech.references.dates?.forEach(date => {
          stats.references.dateRefs.add(date);
        });
        speech.references.bills?.forEach(bill => {
          stats.references.billRefs.add(bill);
        });
      }

      // Track quotes
      if (speech.quoted_text?.length) {
        stats.references.quotedTextCount += speech.quoted_text.length;
      }
    });

    // Track interventions
    if (section.interventions?.length) {
      stats.speakerStats.interventions += section.interventions.length;
    }
  });
}

// Main execution
if (require.main === module) {
  const outputDir = process.argv[2] || './output';
  const analysis = analyzeDebates(outputDir);
  fs.writeFileSync(
    path.join(outputDir, 'meta-analysis.json'),
    JSON.stringify(analysis, null, 2)
  );
}

module.exports = { analyzeDebates };