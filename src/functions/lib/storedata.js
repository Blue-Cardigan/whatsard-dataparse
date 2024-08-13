require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { processXML } = require('./parsexml');
const { fetchXMLData } = require('./fetchxml');
const { format, addDays, parse, isAfter } = require('date-fns');

// Get environment variables to initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
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

async function storeDataInSupabase(debates) {
  initSupabase(supabaseUrl, supabaseServiceKey);

  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  // Adjust debate types and remove specified rows before storing
  const adjustedDebates = adjustDebateTypes(debates);

  // Store debates in batches
  const debateChunks = Array.from({ length: Math.ceil(adjustedDebates.length / 100) }, (_, i) =>
    adjustedDebates.slice(i * 100, (i + 1) * 100)
  );
  for (const chunk of debateChunks) {
    const { error } = await supabase.from('commons').upsert(chunk.map(debate => ({
      id: debate.id,
      title: debate.title,
      type: debate.type,
      speaker_ids: debate.speaker_ids,
      speeches: debate.speeches
    })));
    if (error) throw error;
  }
}

async function processAndStoreData(xmlString, date, suffix) {
  const debates = processXML(xmlString);
  await storeDataInSupabase(debates);
  console.log(`Data for ${date}${suffix} successfully stored in Supabase`);
}

async function main(startDateString) {
  try {
    const suffixes = ['a', 'b', 'c', 'd'];
    const endDate = parse('2024-07-30', 'yyyy-MM-dd', new Date());
    let currentDate = parse(startDateString, 'yyyy-MM-dd', new Date());

    while (!isAfter(currentDate, endDate)) {
      const formattedDate = format(currentDate, 'yyyy-MM-dd');
      
      for (const suffix of suffixes) {
        const xmlString = await fetchXMLData(formattedDate, suffix);
        if (xmlString) {
          await processAndStoreData(xmlString, formattedDate, suffix);
        }
      }
      
      console.log(`All available data for ${formattedDate} processed and stored`);
      currentDate = addDays(currentDate, 1);
    }
    
    console.log('Processing completed for all dates up to 2024-07-30');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Check if a date argument is provided
const dateArg = process.argv[2];
if (!dateArg) {
  console.error('Please provide a start date in the format YYYY-MM-DD');
  process.exit(1);
}
main(dateArg);