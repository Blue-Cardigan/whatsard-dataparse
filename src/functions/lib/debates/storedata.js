require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { processXML: processCommonsXML } = require('./parsecommons');
const { processXML: processLordsXML } = require('./parselords');
const { processXML: processWestminsterXML } = require('./parsewestminster');
const { processXML: processPublicBillXML } = require('./parsepublicbills');
const { fetchXMLData } = require('./fetchxml');
const { format, addDays, parse, isAfter, isBefore, isValid } = require('date-fns');

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
    case 'publicbills':
      processXML = processPublicBillXML;
      break;
    default:
      throw new Error(`Invalid debate type: ${debateType}`);
  }
  const debates = processXML(xmlString);
  await storeDataInSupabase(debates, debateType);
  console.log(`Data for ${debateType} ${date}${suffix} successfully stored in Supabase`);
}

function parseArguments(args) {
  const parsedArgs = {
    debateType: ['commons', 'lords', 'westminster', 'publicbills'],
    date: format(new Date(), 'yyyy-MM-dd'),
    endDate: null,
    suffix: null
  };

  args.forEach(arg => {
    const [key, value] = arg.split('=');
    if (key === 'debateType') {
      parsedArgs.debateType = value.split(',').filter(type => 
        ['commons', 'lords', 'westminster', 'publicbills'].includes(type)
      );
    } else if (key === 'date' || key === 'endDate') {
      const dateMatch = value.match(/^(\d{4}-\d{2}-\d{2})([a-d])?$/);
      if (dateMatch) {
        const date = parse(dateMatch[1], 'yyyy-MM-dd', new Date());
        if (isValid(date)) {
          parsedArgs[key] = dateMatch[1];
          if (key === 'date' && dateMatch[2]) {
            parsedArgs.suffix = dateMatch[2];
          }
        } else {
          console.warn(`Invalid date for ${key}: ${value}. Using default or ignoring.`);
        }
      } else {
        console.warn(`Invalid date format for ${key}: ${value}. Using default or ignoring.`);
      }
    }
  });

  return parsedArgs;
}

async function processDebateType(startDateString, endDateString, debateType, suffix) {
  try {
    const suffixes = suffix ? [suffix] : ['a', 'b', 'c', 'd'];
    const startDate = parse(startDateString, 'yyyy-MM-dd', new Date());
    const endDate = endDateString ? parse(endDateString, 'yyyy-MM-dd', new Date()) : startDate;
    let currentDate = startDate;

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
    
    console.log(`Processing completed for ${debateType} from ${startDateString} to ${endDateString || startDateString}`);
  } catch (error) {
    console.error(`Error processing ${debateType}:`, error);
  }
}

async function main(args) {
  const { debateType, date, endDate, suffix } = parseArguments(args);

  if (debateType.length === 0) {
    console.error('No valid debate types specified. Please use "commons", "lords", "westminster", or "publicbills"');
    process.exit(1);
  }

  console.log(`Processing debate types: ${debateType.join(', ')}`);
  console.log(`Starting from date: ${date}`);
  if (endDate) {
    console.log(`Ending at date: ${endDate}`);
  } else {
    console.log('Processing for a single date');
  }

  for (const type of debateType) {
    await processDebateType(date, endDate, type, suffix);
  }
}

// Use process.argv.slice(2) to get command line arguments
const args = process.argv.slice(2);

main(args).catch(error => {
  console.error('An error occurred:', error);
  process.exit(1);
});