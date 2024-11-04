const axios = require('axios');
const { formatSpeechForDB } = require('./parliamentaryBusiness.cjs');
const fs = require('fs').promises;
const { DOMParser } = require('@xmldom/xmldom');
const { LordsParliamentaryProcessor } = require('./testLords.cjs');
const { WestminsterHallProcessor } = require('./testWestminhall.cjs');
const { StandingCommitteeProcessor } = require('./testStanding.cjs');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const { ParliamentaryProcessor } = require('./parliamentaryBusiness.cjs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.DATABASE_URL;
const supabaseServiceKey = process.env.SERVICE_KEY;
let supabase = null;

function initSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('DATABASE_URL and SERVICE_KEY must be set in environment variables');
  }
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return supabase;
}

function createParticipationRecord(businessId, speech) {
  if (!businessId || !speech.speakerId || !speech.speakerName) {
    console.log('Missing required fields for participation record:', {
      businessId,
      speakerId: speech.speakerId,
      speakerName: speech.speakerName
    });
    return null;
  }

  // Determine role flags
  const role = (speech.role || '').toLowerCase();
  const isMinister = role.includes('minister');
  const isChair = role.includes('chair') || 
                 role.includes('speaker') || 
                 role.includes('deputy speaker');
  const isTeller = speech.type?.toLowerCase().includes('teller') || false;

  // Create a properly structured role object
  const roleObject = {
    role: String(speech.role || 'SPEAKER'),
    start_time: speech.time || null,
    end_time: null
  };

  const record = {
    business_item_id: String(businessId),
    member_id: String(speech.speakerId),
    member_name: String(speech.speakerName),
    roles: JSON.stringify([roleObject]),
    is_minister: Boolean(isMinister),
    is_chair: Boolean(isChair),
    is_teller: Boolean(isTeller),
    contribution_count: 1,
    contribution_types: JSON.stringify({
      [String(speech.type || 'SPEECH')]: 1
    }),
    first_contribution: speech.time || null,
    last_contribution: speech.time || null,
    created_at: new Date().toISOString()
  };
  
  return record;
}

async function storeInSupabase(result, dateString, type) {
  const supabase = initSupabase();
  
  // Map house values and session types correctly
  let house, sessionType;
  switch (type) {
    case 'westminhall':
      house = 'westminster_hall';
      sessionType = 'WESTMINSTER_HALL';
      break;
    case 'standing':
      house = 'committee';
      sessionType = 'COMMITTEE';
      break;
    case 'lords':
      house = 'lords';
      sessionType = 'MAIN_CHAMBER';
      break;
    case 'commons':
    default:
      house = 'commons';
      sessionType = 'MAIN_CHAMBER';
  }
  
  // Create business session
  const sessionData = {
    id: `${type}_${dateString}`,
    date: dateString,
    house: house,
    session_type: sessionType,
    created_at: new Date().toISOString()
  };

  const { error: sessionError } = await supabase
    .from('business_sessions')
    .upsert(sessionData, { onConflict: 'id' });

  if (sessionError) {
    console.error('Error storing session:', sessionError);
    throw sessionError;
  }

  // Process each business item
  for (const business of result.business) {
    const businessId = business.id || `${sessionData.id}_${business.sequence_number || Math.random().toString(36).slice(2, 7)}`;
    
    // Extract lead minister from the business object
    const leadMinister = business.lead_minister || business.leadMinister;
    
    const businessData = {
      id: businessId,
      session_id: sessionData.id,
      parent_item_id: business.parentId || null,
      
      // Classification
      type_category: business.type?.category || 'MAIN_DEBATE',
      type_specific: business.type?.type,
      sequence_number: business.sequence_number || null,
      
      // Content
      title: business.title,
      subtitle: business.subtitle,
      start_time: business.startTime,
      end_time: business.endTime,
      column_start: business.columnStart || null,
      column_end: business.columnEnd || null,
      
      // Question Time specific fields
      is_question_time: business.type?.category === 'ORAL_QUESTIONS',
      is_topical: business.type?.type === 'TOPICAL',
      question_number: business.questionNumber || null,
      
      // Lead Minister details - updated to use extracted leadMinister
      lead_minister_id: leadMinister?.id || null,
      lead_minister_name: leadMinister?.name || null,
      lead_minister_role: leadMinister?.role || null,
      
      // Metadata
      reference_data: business.references || {},
      topics: business.topics || [],
      tags: business.tags || [],
      
      created_at: new Date().toISOString()
    };
    console.log('Storing business item:', businessData);

    const { error: businessError } = await supabase
      .from('business_items')
      .upsert(businessData, { onConflict: 'id' });

    if (businessError) {
      console.error('Error storing business item:', businessError);
      continue;
    }

    // Store speeches and track participation
    if (business.speeches?.length > 0) {
      // Deduplicate speeches by ID before upserting
      const uniqueSpeeches = new Map();
      business.speeches.forEach(speech => {
        const speechId = speech.id || `${businessId}_speech_${speech.sequence}`;
        uniqueSpeeches.set(speechId, {
          id: speechId,
          business_item_id: businessId,
          speaker_id: speech.speakerId,
          speaker_name: speech.speakerName,
          speaker_role: speech.role,
          party: speech.party,
          constituency: speech.constituency,
          type: speech.type || 'SPEECH',
          content: speech.content,
          time: speech.time || null,
          column_number: speech.column,
          is_procedural: speech.isProcedural || false,
          is_intervention: speech.type?.includes('Intervention') || false,
          oral_question_number: speech.oralQuestionNumber,
          reference_data: {
            quoted_text: speech.quotedText,
            division: speech.division
          },
          created_at: new Date().toISOString()
        });
      });

      const speeches = Array.from(uniqueSpeeches.values());
      
      if (speeches.length > 0) {
        const { error: speechError } = await supabase
          .from('speeches')
          .upsert(speeches, { 
            onConflict: 'id',
            ignoreDuplicates: true 
          });

        if (speechError) {
          console.error('Error storing speeches:', speechError);
        }
      }

      // Track participation for each unique speaker
      const participationByMember = new Map();
      
      for (const speech of business.speeches) {
        if (!speech.speakerId || !speech.speakerName) continue;
        
        const participationId = `${businessId}_${speech.speakerId}`;
        const existing = participationByMember.get(participationId);
        
        if (existing) {
          // Update existing participation record
          existing.contribution_count++;
          
          // Update contribution types
          const types = JSON.parse(existing.contribution_types);
          types[String(speech.type || 'SPEECH')] = 
            (types[String(speech.type || 'SPEECH')] || 0) + 1;
          existing.contribution_types = JSON.stringify(types);
          
          // Update roles if needed
          const roles = JSON.parse(existing.roles);
          const currentRole = roles[roles.length - 1];
          if (speech.role && currentRole.role !== speech.role) {
            currentRole.end_time = speech.time;
            roles.push({
              role: speech.role,
              start_time: speech.time,
              end_time: null
            });
            existing.roles = JSON.stringify(roles);
          }
          
          if (speech.time) {
            if (!existing.first_contribution || speech.time < existing.first_contribution) {
              existing.first_contribution = speech.time;
            }
            if (!existing.last_contribution || speech.time > existing.last_contribution) {
              existing.last_contribution = speech.time;
            }
          }
        } else {
          const record = createParticipationRecord(businessId, speech);
          if (record) participationByMember.set(participationId, record);
        }
      }

      const participation = Array.from(participationByMember.values());
      if (participation.length > 0) {
        console.log(`Attempting to store ${participation.length} participation records`);
        
        for (const record of participation) {
          try {
            const { data, error } = await supabase
              .from('debate_participation')
              .upsert([record], {
                onConflict: ['business_item_id', 'member_id'],
                returning: 'minimal'
              });

            if (error) {
              console.error('Error storing participation record:', {
                error: {
                  message: error.message,
                  code: error.code,
                  details: error.details,
                  hint: error.hint
                },
                record: record,
                requestDetails: {
                  table: 'debate_participation',
                  operation: 'upsert',
                  conflictTarget: ['business_item_id', 'member_id']
                }
              });

              // Log the raw request for debugging
              console.log('Raw record being sent:', JSON.stringify(record, null, 2));
              
              // Try to fetch any existing record
              const { data: existing } = await supabase
                .from('debate_participation')
                .select('*')
                .eq('business_item_id', record.business_item_id)
                .eq('member_id', record.member_id)
                .single();
                
              if (existing) {
                console.log('Existing record:', JSON.stringify(existing, null, 2));
              }
            }
          } catch (error) {
            console.error('Exception in participation storage:', {
              error: {
                message: error.message,
                name: error.name,
                stack: error.stack
              },
              record: record
            });
          }
        }
      }

      // Update participation record for lead minister if present
      if (business.leadMinister?.id) {
        const ministerParticipation = {
          business_item_id: businessId,
          member_id: business.leadMinister.id,
          member_name: business.leadMinister.name,
          roles: [{
            role: business.leadMinister.role,
            start_time: business.startTime
          }],
          is_minister: true,
          contribution_count: 0,  // Will be updated by speech processing
          contribution_types: {},
          created_at: new Date().toISOString()
        };

        const { error: ministerError } = await supabase
          .from('debate_participation')
          .upsert(ministerParticipation, { 
            onConflict: ['business_item_id', 'member_id'],
            // Only update if the existing record doesn't have is_minister set
            where: builder => builder.eq('is_minister', false)
          });

        if (ministerError) {
          console.error('Error updating minister participation:', ministerError);
        }
      }
    }
  }

  console.log(`Successfully stored ${result.business.length} business items for ${dateString}`);
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Connection': 'keep-alive',
};

async function fetchDebateXML(dateString, type = 'commons') {
  console.log(`Fetching ${type} debate XML for ${dateString}`);
  
  if (type === 'standing') {
    console.log('Fetching standing committee files');
    const baseUrl = 'https://www.theyworkforyou.com/pwdata/scrapedxml/standing/';
    
    try {
      const files = await getPublicBillFiles(dateString);
      console.log(`Found ${files.length} files`);
      
      const validFiles = [];
      
      for (const file of files) {
        console.log(`Checking ${file.fileName}`);
        try {
          const response = await axios.get(`${baseUrl}${file.fileName}`, { 
            headers: BROWSER_HEADERS,
          });
          if (response.data.includes('latest="yes"')) {
            validFiles.push({
              fileName: file.fileName,
              content: response.data
            });
          }
        } catch (error) {
          if (error.response?.status !== 404) {
            console.error(`Error fetching standing committee file:`);
          }
          continue;
        }
      }
      
      return validFiles;
    } catch (error) {
      console.error('Error fetching standing committee files:');
      return null;
    }
  } else if (type === 'lords') {
    const baseUrl = `https://www.theyworkforyou.com/pwdata/scrapedxml/lordspages/daylord${dateString}`;
    const suffixes = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    return await tryFetchWithSuffixes(baseUrl, suffixes);
  } else if (type === 'westminhall') {
    const baseUrl = `https://www.theyworkforyou.com/pwdata/scrapedxml/westminhall/westminster${dateString}`;
    const suffixes = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    return await tryFetchWithSuffixes(baseUrl, suffixes);
  } else {
    const baseUrl = `https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates${dateString}`;
    const suffixes = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    return await tryFetchWithSuffixes(baseUrl, suffixes);
  }
}

async function getPublicBillFiles(dateString) {
    const url = 'https://www.theyworkforyou.com/pwdata/scrapedxml/standing/';
    const response = await axios.get(url, { 
        headers: BROWSER_HEADERS,
    });
    const $ = cheerio.load(response.data);
  
    const fileGroups = new Map();
    
    $('tr').toArray().forEach(el => {
      const fileName = $(el).find('td:nth-child(2) a').text();
      if (fileName.endsWith('.xml') && fileName.includes(dateString)) {
        const baseName = fileName.replace(/[a-z]\.xml$/, '');
        const suffix = fileName.match(/([a-z])\.xml$/)?.[1] || '';
        const lastModified = new Date($(el).find('td:nth-child(3)').text());
        
        if (!fileGroups.has(baseName)) {
          fileGroups.set(baseName, []);
        }
        fileGroups.get(baseName).push({ fileName, suffix, lastModified });
      }
    });

    const files = Array.from(fileGroups.values()).map(group => {
      group.sort((a, b) => b.suffix.localeCompare(a.suffix));
      return group[0];
    });

    return files;
}

async function tryFetchWithSuffixes(baseUrl, suffixes) {
  for (const suffix of suffixes) {
    const url = `${baseUrl}${suffix}.xml`;
    console.log(`Checking ${url}`);
    try {
      const response = await axios.get(url, { 
        headers: BROWSER_HEADERS,
      });
      const xmlData = response.data;
      
      if (xmlData.includes('latest="yes"')) {
        console.log(`Received ${xmlData.length} characters of XML data`);
        return xmlData;
      }
    } catch (error) {
      if (error.response?.status && ![404, 503].includes(error.response.status)) {
        console.error(`Error fetching URL ${url}:`, error.message);
      }
      continue;
    }
  }
  return null;
}

async function processDebateForDate(dateString, type = 'commons') {
  const types = Array.isArray(type) ? type : [type];
  const results = {};

  for (const debateType of types) {
    try {
      console.log(`Processing debate type: ${debateType}`);
      const xmlData = await fetchDebateXML(dateString, debateType);
      
      if (!xmlData) {
        console.log(`No data found for ${debateType}`);
        continue;
      }

      console.log(`Received XML data of length: ${xmlData.length}`);
      
      const result = await processDebateType(dateString, debateType, xmlData);
      if (result && result.business && result.business.length > 0) {
        results[debateType] = result;
        console.log(`Processed ${result.business.length} business items`);
      } else {
        console.log(`No valid business items found for ${debateType}`);
      }
    } catch (error) {
      console.error(`Error processing ${debateType} debate for ${dateString}:`, error);
      continue;
    }
  }

  return Object.values(results).some(r => r?.business?.length > 0) ? results : null;
}

async function processDebateType(dateString, type, xmlData) {
  console.log(`Processing ${type} debate with ${xmlData?.length || 0} bytes of data`);
  
  if (!xmlData) {
    console.log(`No XML data found for ${type}`);
    return null;
  }

  // Handle array of files for standing committees
  if (type === 'standing' && Array.isArray(xmlData)) {
    console.log(`Processing ${xmlData.length} standing committee files`);
    const results = [];
    
    for (const file of xmlData) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(file.content, 'text/xml');
        
        console.log(`Processing standing committee file: ${file.fileName}`);
        
        const processor = new StandingCommitteeProcessor({
          date: dateString,
          includeInterventions: true,
          trackReferences: true,
          fileName: file.fileName
        });
        
        const result = processor.process(xmlDoc);
        if (result && result.business && result.business.length > 0) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Error processing standing committee file ${file.fileName}:`, error);
        continue;
      }
    }
    
    if (results.length === 0) {
      console.log('No valid business items found in any standing committee files');
      return null;
    }
    
    // Combine results from all files
    return {
      business: results.flatMap(r => r.business),
      metadata: {
        date: dateString,
        files: xmlData.map(f => f.fileName),
        ...results[0].metadata
      }
    };
  }

  // Handle single XML file for other debate types
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlData, 'text/xml');
  
  console.log('XML parsed successfully. Root element:', xmlDoc.documentElement?.nodeName);
  
  let processor;
  switch (type) {
    case 'lords':
      processor = new LordsParliamentaryProcessor({
        date: dateString,
        includeInterventions: true,
        trackReferences: true
      });
      break;
    case 'westminhall':
      processor = new WestminsterHallProcessor({
        date: dateString,
        includeInterventions: true,
        trackReferences: true
      });
      break;
    default:
      processor = new ParliamentaryProcessor({
        date: dateString,
        includeInterventions: true,
        trackReferences: true
      });
  }

  const result = processor.process(xmlDoc);
  
  if (!result || !result.business || result.business.length === 0) {
    console.log('No business items found in processing result');
    return null;
  }

  console.log(`Found ${result.business.length} business items`);
  
  // Add validation and default for speeches
  const formattedResult = {
    date: dateString,
    business: result.business.map(business => ({
      ...business,
      speeches: Array.isArray(business.speeches) 
        ? business.speeches.map(speech => 
            typeof formatSpeechForDB === 'function' 
              ? formatSpeechForDB(speech) 
              : speech
          )
        : []
    })),
    metadata: {
      ...result.metadata,
      processingDate: new Date().toISOString(),
      sourceUrl: getSourceUrl(dateString, type)
    }
  };

  const outputPath = `./output/${dateString}-${type}.json`;
  await fs.mkdir('./output', { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(formattedResult, null, 2));
  
  console.log(`Successfully processed ${type} debate for ${dateString}`);
  console.log(`Output saved to: ${outputPath}`);

  await storeInSupabase(formattedResult, dateString, type);
  
  console.log(`Successfully processed and stored ${type} debate for ${dateString}`);
  
  return result;
}

function getSourceUrl(dateString, type) {
  switch (type) {
    case 'standing':
      return `https://www.theyworkforyou.com/pwdata/scrapedxml/standing/`;
    case 'lords':
      return `https://www.theyworkforyou.com/pwdata/scrapedxml/lordspages/daylord${dateString}a.xml`;
    case 'westminhall':
      return `https://www.theyworkforyou.com/pwdata/scrapedxml/westminhall/westminster${dateString}a.xml`;
    default:
      return `https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates${dateString}.xml`;
  }
}

async function processDebatesForPeriod(startDate, numberOfDays = 1, type = 'commons') {
  const types = Array.isArray(type) ? type : [type];
  const results = {};

  let currentDate = dayjs(startDate);
  
  for (let day = 0; day < numberOfDays; day++) {
    const dateString = currentDate.format('YYYY-MM-DD');
    console.log(`Processing date: ${dateString}`);
    
    try {
      const dateResults = await processDebateForDate(dateString, types);
      if (dateResults) {
        console.log(`Found results for ${dateString}:`, Object.keys(dateResults));
        results[dateString] = dateResults;
      } else {
        console.log(`No valid results found for ${dateString}`);
      }
    } catch (error) {
      console.error(`Error processing debates for ${dateString}:`, error);
    }
    
    currentDate = currentDate.subtract(1, 'day');
  }

  if (Object.keys(results).length === 0) {
    console.log('No valid debate data found for any of the processed dates');
    return null;
  }
  return results;
}

if (require.main === module) {
  const date = process.argv[2];
  let numberOfDays = 1;
  let types = ['commons'];

  if (process.argv[3] && !isNaN(process.argv[3])) {
    numberOfDays = parseInt(process.argv[3]);
    types = process.argv.slice(4);
  } else if (process.argv[3]) {
    types = process.argv.slice(3);
  }
  
  processDebatesForPeriod(date, numberOfDays, types)
    .then(results => {
      if (results) {
        console.log('Successfully processed debates for all specified dates');
        console.log('Dates processed:', Object.keys(results).join(', '));
      } else {
        console.log('No debates found for the specified period');
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { 
  processDebateForDate, 
  fetchDebateXML,
  processDebatesForPeriod
};