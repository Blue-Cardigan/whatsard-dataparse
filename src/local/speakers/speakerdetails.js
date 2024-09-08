require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');

const supabaseUrl = process.env.DATABASE_URL;
const supabaseServiceKey = process.env.SERVICE_KEY;

let supabase = null;

function initSupabase() {
  if (!supabase) {
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

async function getImageUrl(personId) {
  const baseUrls = [
    `https://www.theyworkforyou.com/people-images/mpsL/${personId}.jpg`,
    `https://www.theyworkforyou.com/people-images/mps/${personId}.jpg`,
    `https://www.theyworkforyou.com/people-images/mpsL/${personId}.jpeg`,
    `https://www.theyworkforyou.com/people-images/mps/${personId}.jpeg`
  ];

  for (const url of baseUrls) {
    try {
      await axios.head(url);
      return url;
    } catch (error) {
      // Continue to the next URL if the current one fails
    }
  }

  // Return a default image URL if none of the above URLs work
  return "https://www.theyworkforyou.com/images/unknownperson_large.png";
}

async function updateSpeakers() {
  initSupabase();

  const peersData = await readCSV('src/functions/lib/speakers/peers.csv');
  const lordsData = await readCSV('src/functions/lib/speakers/lords.csv');

  const peersMap = new Map(peersData.map(peer => [peer.Name, peer]));
  const lordsMap = new Map(lordsData.map(lord => [lord.Title, lord]));

  const { data: speakers, error } = await supabase.from('speakers').select('*');
  if (error) throw error;

  const existingSpeakerIds = new Set(speakers.map(speaker => speaker.id));

  for (const peer of peersData) {
    const { "Person ID": personId, Name: name, Party: party, URI: url } = peer;

    if (existingSpeakerIds.has(personId)) {
      console.log(`Speaker with ID ${personId} already exists. Skipping.`);
      continue;
    }

    const lordData = lordsMap.get(name);
    const updates = {
      id: personId,
      name,
      party,
      url,
      image_url: await getImageUrl(personId)
    };

    if (lordData) {
      updates.age = lordData.Age;
      updates.peerage_type = lordData["Peerage type"];
      updates.start_date = lordData["Start date"];
    }

    const { error: insertError } = await supabase
      .from('speakers')
      .insert(updates);

    if (insertError) {
      console.error(`Error inserting speaker ${personId}:`, insertError);
    } else {
      console.log(`Inserted new speaker ${personId}`);
    }
  }

  for (const speaker of speakers) {
    // Skip non-integer IDs
    if (!Number.isInteger(Number(speaker.id))) {
      console.log(`Skipping non-integer ID: ${speaker.id}`);
      continue;
    }

    const updates = {};
    const peerData = peersMap.get(speaker.name);
    const lordData = lordsMap.get(speaker.name);

    if (peerData) {
      updates.party = peerData.Party;
      updates.url = peerData.URI;
    }

    if (lordData) {
      updates.age = lordData.Age;
      updates.peerage_type = lordData["Peerage type"];
      updates.start_date = lordData["Start date"];
    }

    updates.image_url = await getImageUrl(speaker.id);

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('speakers')
        .update(updates)
        .eq('id', speaker.id);

      if (updateError) {
        console.error(`Error updating speaker ${speaker.id}:`, updateError);
      } else {
        console.log(`Updated speaker ${speaker.id}`);
      }
    }
  }
}

updateSpeakers().catch(console.error);