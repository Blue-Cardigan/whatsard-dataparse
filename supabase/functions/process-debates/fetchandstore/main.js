import { config } from 'https://deno.land/x/dotenv/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0';
import { processXML as processCommonsXML } from './parsecommons.js';
import { processXML as processLordsXML } from './parselords.js';
import { processXML as processWestminsterXML } from './parsewestminster.js';
import { processXML as processPublicBillXML } from './parsepublicbills.js';
import { fetchXMLData } from './fetchxml.js';
import { format, addDays, parse, isAfter, isBefore, isValid } from 'https://jspm.dev/date-fns@2.22.1';

const supabaseUrl = Deno.env.get('DATABASE_URL');
const supabaseServiceKey = Deno.env.get('SERVICE_KEY');

let supabase = null;

function initSupabase(supabaseUrl, supabaseServiceKey) {
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

  // Remove speeches with null content
  const cleanedDebates = validDebates.map(debate => ({
    ...debate,
    speeches: debate.speeches.filter(speech => speech.content != null)
  }));

  const debateChunks = Array.from({ length: Math.ceil(cleanedDebates.length / 100) }, (_, i) =>
    cleanedDebates.slice(i * 100, (i + 1) * 100)
  );

  for (const chunk of debateChunks) {
    // Upsert debates (insert or update)
    const { error: upsertError } = await supabase
      .from(debateType)
      .upsert(chunk.map(debate => ({
        id: debate.id,
        title: debate.title,
        type: debate.type,
        speaker_ids: debate.speaker_ids,
        speaker_names: debate.speaker_names,
        speeches: debate.speeches
      })), 
      { 
        onConflict: 'id',
        ignoreDuplicates: false
      });

    if (upsertError) {
      console.error(`Error upserting debates into ${debateType} table:`, upsertError);
      throw upsertError;
    }
  }

  console.log(`Stored or updated ${cleanedDebates.length} valid debates out of ${debates.length} total debates in ${debateType} table.`);
}

async function processAndStoreData(xmlString, startDate, suffix, debateType) {
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
  console.log(`Data for ${debateType} ${startDate}${suffix} successfully stored in Supabase`);
}

function parseArguments(args) {
  const parsedArgs = {
    debateType: ['commons', 'lords', 'westminster', 'publicbills'],
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: null,
    suffix: null
  };

  args.forEach(arg => {
    const [key, value] = arg.split('=');
    if (key === 'debateType') {
      parsedArgs.debateType = value.split(',').filter(type => 
        ['commons', 'lords', 'westminster', 'publicbills'].includes(type)
      );
    } else if (key === 'startDate' || key === 'endDate') {
      const dateMatch = value.match(/^(\d{4}-\d{2}-\d{2})([a-d])?$/);
      if (dateMatch) {
        const date = parse(dateMatch[1], 'yyyy-MM-dd', new Date());
        if (isValid(date)) {
          parsedArgs[key] = dateMatch[1];
          if (key === 'startDate' && dateMatch[2]) {
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

async function processDebateType(startDate, endDate, debateType, suffix) {
  try {
    const suffixes = suffix ? [suffix] : ['a', 'b', 'c', 'd'];
    const startDateDate = parse(startDate, 'yyyy-MM-dd', new Date());
    const endDateDate = endDate ? parse(endDate, 'yyyy-MM-dd', new Date()) : startDateDate;
    let currentDate = startDateDate;

    while (!isAfter(currentDate, endDateDate)) {
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
    
    console.log(`Processing completed for ${debateType} from ${startDate} to ${endDate || startDate}`);
  } catch (error) {
    console.error(`Error processing ${debateType}:`, error);
  }
}

async function main(args) {
  const { debateType, startDate, endDate, suffix } = parseArguments(args);

  if (debateType.length === 0) {
    console.error('No valid debate types specified. Please use "commons", "lords", "westminster", or "publicbills"');
    Deno.exit(1);
  }

  console.log(`Processing debate types: ${debateType.join(', ')}`);
  console.log(`Starting from date: ${startDate}`);
  if (endDate) {
    console.log(`Ending at date: ${endDate}`);
  } else {
    console.log('Processing for a single date');
  }

  for (const type of debateType) {
    await processDebateType(startDate, endDate, type, suffix);
  }
}

// Export the main function and processAndStoreData for use in other modules
export { main, processAndStoreData };

// If this module is the main module being run, execute the main function
if (import.meta.main) {
  const args = Deno.args;
  main(args).catch(error => {
    console.error('An error occurred:', error);
    Deno.exit(1);
  });
}