const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.DATABASE_URL;
const supabaseServiceKey = process.env.SERVICE_KEY;

function initSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('DATABASE_URL and SERVICE_KEY must be set in environment variables');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function upsertDebateFile(filePath) {
  const supabase = initSupabase();
  
  try {
    // Read and parse the JSON file
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const dateString = data.date;
    
    // Skip meta-analysis files
    if (filePath.includes('meta-analysis')) {
      console.log('Skipping meta-analysis file:', filePath);
      return false;
    }

    // Determine type from filename more robustly
    const filename = path.basename(filePath);
    const typeMatch = filename.match(/\d{4}-\d{2}-\d{2}-(\w+)\.json$/);
    if (!typeMatch) {
      console.error(`Invalid filename format: ${filename}`);
      return false;
    }
    const type = typeMatch[1];
    
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
        house = 'commons';
        sessionType = 'MAIN_CHAMBER';
        break;
      default:
        console.error(`Unknown debate type: ${type}`);
        return false;
    }
    
    // Create business session with correct house and session_type
    const sessionData = {
      id: `${type}_${dateString}`,
      date: dateString,
      house: house,
      session_type: sessionType,
      created_at: new Date().toISOString()
    };

    // Validate required fields
    if (!sessionData.date || !sessionData.house) {
      console.error(`Missing required fields for ${filename}. Date: ${sessionData.date}, House: ${sessionData.house}`);
      return false;
    }

    console.log(`Processing ${filename}...`);
    console.log(`Creating session:`, sessionData);

    const { error: sessionError } = await supabase
      .from('business_sessions')
      .upsert(sessionData, { onConflict: 'id' });

    if (sessionError) {
      console.error('Error storing session:', sessionError);
      throw sessionError;
    }

    // Process each business item
    for (const business of data.business) {
      // Generate business item ID
      const businessId = business.metadata?.id || 
                        `${sessionData.id}_${business.sequence_number || Math.random().toString(36).slice(2, 7)}`;
      
      const businessData = {
        id: businessId,
        session_id: sessionData.id,
        type_category: business.type?.category || 'MAIN_DEBATE',
        type_specific: business.type?.type,
        title: business.metadata?.title,
        subtitle: business.metadata?.subtitle,
        start_time: business.metadata?.startTime,
        end_time: business.metadata?.endTime,
        topics: business.metadata?.topics || [],
        tags: business.metadata?.tags || [],
        reference_data: business.metadata || {},
        created_at: new Date().toISOString()
      };

      console.log(`Creating business item: ${businessId}`);

      const { error: businessError } = await supabase
        .from('business_items')
        .upsert(businessData, { onConflict: 'id' });

      if (businessError) {
        console.error('Error storing business item:', businessError);
        continue;
      }

      // Store speeches
      if (business.speeches && business.speeches.length > 0) {
        const speeches = business.speeches.map((speech, index) => ({
          id: speech.id || `${businessId}_speech_${index}`,
          business_item_id: businessId,
          speaker_id: speech.speaker_id,
          speaker_name: speech.speaker_name,
          speaker_role: speech.role,
          party: speech.party,
          constituency: speech.constituency,
          type: speech.type || 'SPEECH',
          content: speech.content,
          time: speech.time || null,
          column_number: speech.column_number,
          is_procedural: speech.is_procedural || false,
          is_intervention: speech.type?.includes('Intervention') || false,
          oral_question_number: speech.oral_qnum,
          reference_data: {
            quoted_text: speech.quoted_text,
            division: speech.division
          },
          created_at: new Date().toISOString()
        }));

        console.log(`Storing ${speeches.length} speeches for ${businessId}`);

        const { error: speechError } = await supabase
          .from('speeches')
          .upsert(speeches, { onConflict: 'id' });

        if (speechError) {
          console.error('Error storing speeches:', speechError);
          continue;
        }
      }
    }

    console.log(`Successfully processed ${filename}`);
    return true;

  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return false;
  }
}

async function processDirectory(directoryPath) {
  try {
    const files = await fs.readdir(directoryPath);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    console.log(`Found ${jsonFiles.length} JSON files to process`);
    
    let successCount = 0;
    let failureCount = 0;

    for (const file of jsonFiles) {
      const filePath = path.join(directoryPath, file);
      const success = await upsertDebateFile(filePath);
      
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    console.log('\nProcessing complete:');
    console.log(`Successfully processed: ${successCount} files`);
    console.log(`Failed to process: ${failureCount} files`);

  } catch (error) {
    console.error('Error reading directory:', error);
  }
}

// Run the script
if (require.main === module) {
  const directoryPath = process.argv[2] || './output';
  
  console.log(`Processing files from: ${directoryPath}`);
  processDirectory(directoryPath)
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  upsertDebateFile,
  processDirectory
}; 