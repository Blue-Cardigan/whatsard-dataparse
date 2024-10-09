require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const csv = require('csv-parser');

const supabaseUrl = process.env.DATABASE_URL;
const supabaseServiceKey = process.env.SERVICE_KEY;

let supabase = null;

function initSupabase() {
  if (!supabase) {
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not set in the environment variables');
    }
    if (!supabaseServiceKey) {
      throw new Error('SUPABASE_SERVICE_KEY is not set in the environment variables');
    }
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
}

function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/^(the\s)?(lord archbishop|lord bishop|lord|baroness|earl|duke|bishop|archbishop)\s+/, '')
    .trim();
}

async function updateSpeakerNames() {
  try {
    initSupabase();
    const { data: speakers, error } = await supabase
      .from('speakers')
      .select('id, name')
      .ilike('name', 'the %');

    if (error) throw error;

    for (const speaker of speakers) {
      const updatedName = speaker.name.replace(/^the\s+/i, '');
      
      const { error: updateError } = await supabase
        .from('speakers')
        .update({ name: updatedName })
        .eq('id', speaker.id);

      if (updateError) {
        console.error(`Error updating speaker ${speaker.id}:`, updateError);
      } else {
        console.log(`Updated speaker ${speaker.id} name from "${speaker.name}" to "${updatedName}"`);
      }
    }
  } catch (error) {
    console.error('Error initializing Supabase:', error.message);
    process.exit(1);
  }
}

async function updateLordsDetails() {
  await updateSpeakerNames();
  
  const lordsData = await readCSV('src/functions/lib/speakers/lords.csv');
  const lordsMap = new Map(lordsData.map(lord => [normalizeName(lord.Title), lord]));

  const { data: speakers, error } = await supabase
    .from('speakers')
    .select('*')
    .is('constituency', null)
    .is('age', null)
    .is('peerage_type', null)
    .is('start_date', null);

  if (error) throw error;

  for (const speaker of speakers) {
    const normalizedSpeakerName = normalizeName(speaker.name);
    const lordData = lordsMap.get(normalizedSpeakerName);

    if (lordData) {
      const updates = {
        age: lordData.Age,
        peerage_type: lordData["Peerage type"],
        start_date: lordData["Start date"]
      };

      const { error: updateError } = await supabase
        .from('speakers')
        .update(updates)
        .eq('id', speaker.id);

      if (updateError) {
        console.error(`Error updating speaker ${speaker.id}:`, updateError);
      } else {
        console.log(`Updated speaker ${speaker.id}`);
      }
    } else {
      console.log(`No matching lord data found for speaker ${speaker.name}`);
    }
  }
}

// updateLordsDetails().catch(console.error);
updateSpeakerNames().catch(console.error);