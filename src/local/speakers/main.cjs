const { createClient } = require('@supabase/supabase-js');
const { extractSpeakers } = require('./parse.cjs');
const { fetchXMLData } = require('../parse/fetchxml.cjs');
const { format, addDays, parse, isAfter } = require('date-fns');
const { getImageUrl, scrapeProfileInfo, generateProfileUrl } = require('./utils.cjs');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.DATABASE_URL;
const supabaseServiceKey = process.env.SERVICE_KEY;

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

async function storeSpeakersInSupabase(speakers) {
  initSupabase(supabaseUrl, supabaseServiceKey);

  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  for (const speaker of speakers) {
    const { data: existingSpeaker, error: fetchError } = await supabase
      .from('speakers')
      .select('*')
      .eq('id', speaker.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error(`Error fetching speaker ${speaker.id}:`, fetchError);
      continue;
    }

    const profileUrl = generateProfileUrl(speaker.id, speaker.name, existingSpeaker?.constituency);
    const imageUrl = await getImageUrl(speaker.id);

    const profileInfo = await scrapeProfileInfo(profileUrl);

    const updates = {
      name: speaker.name,
      url: profileUrl,
      image_url: imageUrl,
      is_current: profileInfo?.isCurrent ?? null,
      party: profileInfo?.party || speaker.party || null,
      department: profileInfo?.department || null,
      ministerial_ranking: profileInfo?.ministerial_ranking ? parseInt(profileInfo.ministerial_ranking, 10) : null,
      constituency: profileInfo?.constituency || null,
      media: profileInfo?.media ? JSON.stringify(profileInfo.media) : null,
    };

    console.log(updates);

    if (existingSpeaker) {
      // Always update is_current, and update other fields only if they are null
      const fieldsToUpdate = { is_current: updates.is_current };
      Object.keys(updates).forEach(key => {
        if (existingSpeaker[key] === null && updates[key] !== null) {
          fieldsToUpdate[key] = updates[key];
        }
      });

      if (Object.keys(fieldsToUpdate).length > 0) {
        const { error: updateError } = await supabase
          .from('speakers')
          .update(fieldsToUpdate)
          .eq('id', speaker.id);

        if (updateError) {
          console.error(`Error updating speaker ${speaker.id}:`, updateError);
        } else {
          console.log(`Updated speaker ${speaker.id}`);
        }
      }
    } else {
      const { error: insertError } = await supabase
        .from('speakers')
        .insert({ id: speaker.id, ...updates });

      if (insertError) {
        console.error(`Error inserting speaker ${speaker.id}:`, insertError);
      } else {
        console.log(`Inserted new speaker ${speaker.id}`);
      }
    }
  }
}

async function processAndStoreSpeakers(xmlString) {
  const speakers = extractSpeakers(xmlString);
  await storeSpeakersInSupabase(speakers);
  console.log(`${speakers.length} speakers successfully stored in Supabase`);
}

async function main(startDateString) {
  try {
    const suffixes = ['a', 'b', 'c', 'd'];
    const endDate = parse('2024-09-07', 'yyyy-MM-dd', new Date());
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
    
    console.log('Processing completed for all dates up to 2024-09-07');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Check if a date argument is provided
const dateArg = process.argv[2];
startDateString = dateArg ? dateArg : '2024-09-03';
main(startDateString);