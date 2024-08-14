require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { processXML: processCommonsXML } = require('./parsecommons');
const { processXML: processLordsXML } = require('./parselords');
const { processXML: processWestminsterXML } = require('./parsewestminster');
const { fetchXMLData } = require('./fetchxml');
const { format, addDays, parse, isAfter } = require('date-fns');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;

function initSupabase(supabaseUrl, supabaseServiceKey) {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
  }
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
}

function adjustDebateTypes(debates) {
  let currentType = '';
  let currentPrepend = '';
  let isFirstRow = true;

  return debates.filter(debate => {
    if (debate.speeches.length === 1 && debate.speeches[0].content.includes('was asked')) {
      if (isFirstRow) {
        // Remove this row by not including it in the filtered result
        currentPrepend = debate.speeches[0].content.trim() + ' ';
        currentType = debate.type;
        isFirstRow = false;
        return false; // This row will be removed
      } else {
        // For non-first rows, apply the prepend
        debate.type = currentPrepend;
      }
    } else if (debate.type === currentType && !isFirstRow) {
      // Apply prepend to subsequent rows of the same type
      debate.type = currentPrepend;
    } else {
      // Reset when type changes
      currentType = debate.type;
      currentPrepend = '';
      isFirstRow = true;
    }
    return true; // Keep this row
  });
}

async function storeDataInSupabase(debates, debateType) {
  initSupabase(supabaseUrl, supabaseServiceKey);

  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const adjustedDebates = adjustDebateTypes(debates);

  // Filter out debates where both title and type are NULL
  const validDebates = adjustedDebates.filter(debate => debate.title != '' || debate.type != '');

  const debateChunks = Array.from({ length: Math.ceil(validDebates.length / 100) }, (_, i) =>
    validDebates.slice(i * 100, (i + 1) * 100)
  );

  for (const chunk of debateChunks) {
    // Extract IDs for the current chunk
    const ids = chunk.map(debate => debate.id);

    // Delete existing debates with the same IDs
    const { error: deleteError } = await supabase
      .from(debateType)
      .delete()
      .in('id', ids);

    if (deleteError) {
      console.error('Error deleting existing debates:', deleteError);
      throw deleteError;
    }

    // Insert new debates
    const { error: insertError } = await supabase
      .from(debateType)
      .insert(chunk.map(debate => ({
        id: debate.id,
        title: debate.title,
        type: debate.type,
        speaker_ids: debate.speaker_ids,
        speeches: debate.speeches
      })));

    if (insertError) {
      console.error('Error inserting new debates:', insertError);
      throw insertError;
    }
  }

  console.log(`Stored ${validDebates.length} valid debates out of ${debates.length} total debates.`);
}

async function processAndStoreData(xmlString, date, suffix, debateType) {
  let processXML;
  switch (debateType) {
    case 'commons':
      processXML = processCommonsXML;
      break;
    case 'lords':
      processXML = processLordsXML;
      break;
    case 'westminster':
      processXML = processWestminsterXML;
      break;
    default:
      throw new Error(`Invalid debate type: ${debateType}`);
  }
  const debates = processXML(xmlString);
  await storeDataInSupabase(debates, debateType);
  console.log(`Data for ${debateType} ${date}${suffix} successfully stored in Supabase`);
}

async function processDebateType(startDateString, debateType) {
  try {
    const suffixes = ['a', 'b', 'c', 'd'];
    const endDate = parse('2024-07-30', 'yyyy-MM-dd', new Date());
    let currentDate = parse(startDateString, 'yyyy-MM-dd', new Date());

    while (!isAfter(currentDate, endDate)) {
      const formattedDate = format(currentDate, 'yyyy-MM-dd');
      
      for (const suffix of suffixes) {
        const xmlString = await fetchXMLData(formattedDate, suffix, debateType);
        if (xmlString) {
          await processAndStoreData(xmlString, formattedDate, suffix, debateType);
        }
      }
      
      console.log(`All available ${debateType} data for ${formattedDate} processed and stored`);
      currentDate = addDays(currentDate, 1);
    }
    
    console.log(`Processing completed for all ${debateType} dates up to 2024-07-30`);
  } catch (error) {
    console.error(`Error processing ${debateType}:`, error);
  }
}

async function main(startDateString, debateType) {
  if (debateType === 'all' || !debateType) {
    await processDebateType(startDateString, 'commons');
    await processDebateType(startDateString, 'lords');
    await processDebateType(startDateString, 'westminster');
  } else {
    await processDebateType(startDateString, debateType);
  }
}

// Check if a date argument is provided
const dateArg = process.argv[2] || '2024-01-01';
const debateType = process.argv[3] || 'all';

if (!['commons', 'lords', 'westminster', 'all'].includes(debateType)) {
  console.error('Invalid debate type. Please use "commons", "lords", "westminster", or "all"');
  process.exit(1);
}

main(dateArg, debateType);