const axios = require('axios');
const { DOMParser } = require('@xmldom/xmldom');
require('dotenv').config();
const { parseCommittee } = require('./parseCommittee.cjs');
const fs = require('fs').promises;
const path = require('path');

async function fetchCommitteeSessions(date) {
  const baseUrl = 'https://www.theyworkforyou.com/pwdata/scrapedxml/standing/';
  
  try {
    // Fetch directory listing
    const response = await axios.get(baseUrl);
    
    // Group files by their base name (everything before the suffix)
    const fileGroups = response.data
      .split('\n')
      .filter(line => line.includes('.xml'))
      .map(line => {
        const match = line.match(/href="(standing\d+_[A-Z']+_\d+-\d+_(\d{4}-\d{2}-\d{2})([ab])\.xml)"/);
        if (!match) return null;
        return {
          filename: match[1],
          date: match[2],
          suffix: match[3],
          baseName: match[1].replace(/[ab]\.xml$/, '')
        };
      })
      .filter(file => file && file.date === date)
      .reduce((groups, file) => {
        if (!groups[file.baseName]) {
          groups[file.baseName] = [];
        }
        groups[file.baseName].push(file);
        return groups;
      }, {});

    // For each group, select the file with suffix 'd' if available, otherwise 'c', 'b', or 'a'
    const selectedFiles = Object.values(fileGroups)
      .map(group => {
        const dVersion = group.find(f => f.suffix === 'd');
        const cVersion = group.find(f => f.suffix === 'c');
        const bVersion = group.find(f => f.suffix === 'b');
        return dVersion || cVersion || bVersion || group[0];
      })
      .sort((a, b) => a.filename.localeCompare(b.filename));

    if (selectedFiles.length === 0) {
      console.log(`No committee files found for date ${date}`);
      return null;
    }

    // Fetch XML content for selected files
    const sessions = await Promise.all(selectedFiles.map(async file => {
      try {
        const url = `${baseUrl}${file.filename}`;
        console.log(`Fetching ${url}`);
        const response = await axios.get(url);
        return {
          filename: file.filename,
          xml: response.data
        };
      } catch (error) {
        console.error(`Error fetching ${file.filename}:`, error.message);
        return null;
      }
    }));

    return sessions.filter(Boolean);
  } catch (error) {
    console.error('Error fetching committee sessions:', error);
    throw error;
  }
}

async function saveCommitteeOutput(data, date, topic) {
  const outputDir = path.join(process.cwd(), 'output');
  await fs.mkdir(outputDir, { recursive: true });
  
  const fileName = `${date}-committee-${topic.toLowerCase()}.json`;
  const filePath = path.join(outputDir, fileName);
  
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  console.log(`Saved ${topic} committee data to ${filePath}`);
}

async function processDate(date) {
  try {
    const sessions = await fetchCommitteeSessions(date);
    if (!sessions) return null;

    // Group sessions by topic
    const topicGroups = sessions.reduce((groups, session) => {
      // Extract topic from filename (e.g., "RENTERS'" or "TERRORISM")
      const topicMatch = session.filename.match(/standing\d+_([A-Z']+)_/);
      if (!topicMatch) return groups;
      
      const topic = topicMatch[1];
      if (!groups[topic]) {
        groups[topic] = [];
      }
      groups[topic].push(session);
      return groups;
    }, {});

    // Process each topic separately
    const results = {};
    for (const [topic, topicSessions] of Object.entries(topicGroups)) {
      const businessItems = [];
      
      for (const session of topicSessions) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(session.xml, 'text/xml');

        const result = parseCommittee(xmlDoc, date);
        if (!result || !result.business) continue;
        
        result.business.forEach(business => {
          const firstSpeechWithTime = business.business_items?.[0]?.speeches
            ?.find(speech => speech.speaker && speech.time);

          businessItems.push({
            type: {
              category: 'COMMITTEE_PROCEEDINGS',
              type: firstSpeechWithTime && 
                    parseInt(firstSpeechWithTime.time.split(':')[0]) >= 14 
                ? 'AFTERNOON' 
                : 'MORNING'
            },
            metadata: {
              id: business.metadata.id,
              title: business.metadata.title,
              subtitle: business.metadata.subtitle,
              chair: business.business_items[0]?.metadata?.chair,
              deputy_chair: business.business_items[0]?.metadata?.deputy_chair,
              clerks: business.business_items[0]?.metadata?.clerks,
              members: business.business_items[0]?.metadata?.members,
              witnesses: business.business_items[0]?.metadata?.witnesses
            },
            speeches: business.business_items[0]?.speeches || [],
            divisions: business.business_items[0]?.divisions || []
          });
        });
      }

      const topicResult = {
        date,
        type: 'committee',
        business: businessItems
      };

      // Save each topic to a separate file
      await saveCommitteeOutput(topicResult, date, topic);
      results[topic] = topicResult;
    }

    return results;
  } catch (error) {
    console.error(`Error processing date ${date}:`, error);
    throw error;
  }
}

// Update command-line handling to show more detailed output
if (require.main === module) {
  const date = process.argv[2];

  if (!date) {
    console.error('Please provide a date (YYYY-MM-DD)');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Invalid date format. Please use YYYY-MM-DD');
    process.exit(1);
  }

  processDate(date)
    .then(results => {
      if (results) {
        console.log('Successfully processed committee proceedings');
        console.log('Topics processed:', Object.keys(results).join(', '));
      } else {
        console.log('No committee proceedings found');
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { processDate }; 