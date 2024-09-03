require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

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

function formatUrlPart(str) {
  return str ? encodeURIComponent(str.toLowerCase().replace(/ /g, '_')) : '';
}

async function scrapeTitle(personId, name, constituency) {
  const url = `https://www.theyworkforyou.com/mp/${personId}/${formatUrlPart(name)}/${formatUrlPart(constituency)}`;

  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const title = $('.person-header__about__known-for').text().trim();
    return { title, url };
  } catch (error) {
    console.error(`Error scraping title for MP ${personId} at ${url}:`, error.message);
    return { title: null, url };
  }
}

async function importOldMPs() {
  const results = [];

  // Read and parse the CSV file
  await new Promise((resolve, reject) => {
    fs.createReadStream('src/functions/lib/speakers/oldmps.csv')
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Read ${results.length} rows from CSV`);

  let inserted = 0;
  let updated = 0;

  for (const row of results) {
    const mp = {
      id: row['Person ID'],
      name: `${row['First name']} ${row['Last name']}`,
      party: row['Party'],
      constituency: row['Constituency'],
      isCurrent: false
    };

    // Check if the MP already exists
    const { data: existingMPs, error: checkError } = await supabase
      .from('speakers')
      .select('*')
      .eq('id', mp.id);

    if (checkError) {
      console.error(`Error checking for existing MP ${mp.id}:`, checkError);
      continue;
    }

    let existingMP = existingMPs && existingMPs.length > 0 ? existingMPs[0] : null;

    // Get image URL if not already present
    if (!existingMP || !existingMP.image_url) {
      mp.image_url = await getImageUrl(mp.id);
    }

    // Scrape title and URL if not already present
    if (!existingMP || !existingMP.title || !existingMP.url) {
      const { title, url } = await scrapeTitle(mp.id, mp.name, mp.constituency);
      mp.title = title;
      mp.url = url;
    }

    if (existingMP) {
      // Update existing MP with any missing values
      const updates = {};
      for (const [key, value] of Object.entries(mp)) {
        if (existingMP[key] === null || existingMP[key] === undefined) {
          updates[key] = value;
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('speakers')
          .update(updates)
          .eq('id', mp.id);

        if (updateError) {
          console.error(`Error updating MP ${mp.id}:`, updateError);
        } else {
          console.log(`Updated MP: ${mp.name} (ID: ${mp.id})`);
          updated++;
        }
      } else {
        console.log(`No updates needed for MP: ${mp.name} (ID: ${mp.id})`);
      }
    } else {
      // Insert the new MP
      const { error: insertError } = await supabase
        .from('speakers')
        .insert(mp);

      if (insertError) {
        console.error(`Error inserting MP ${mp.id}:`, insertError);
      } else {
        console.log(`Inserted MP: ${mp.name} (ID: ${mp.id})`);
        inserted++;
      }
    }
  }

  console.log(`Import completed. Inserted: ${inserted}, Updated: ${updated}`);
}

importOldMPs().catch(console.error);