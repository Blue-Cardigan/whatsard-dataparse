require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { extractSpeakers } = require('./parsespeakers');
const { fetchXMLData } = require('../debates/fetchxml');
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

async function storeSpeakersInSupabase(speakers) {
  initSupabase(supabaseUrl, supabaseServiceKey);

  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { error } = await supabase.from('speakers').upsert(speakers, {
    onConflict: 'id',
    ignoreDuplicates: false
  });

  if (error) throw error;
}

async function processAndStoreSpeakers(xmlString) {
  const speakers = extractSpeakers(xmlString);
  await storeSpeakersInSupabase(speakers);
  console.log(`${speakers.length} speakers successfully stored in Supabase`);
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
          await processAndStoreSpeakers(xmlString);
        }
      }
      
      console.log(`All available speaker data for ${formattedDate} processed and stored`);
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