require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.DATABASE_URL, process.env.SERVICE_KEY);

const BATCH_SIZE = 1000; // Adjust this value based on your Supabase plan and performance needs

async function upsertPostcodeLookup() {
  const results = [];
  let processed = 0;
  let batches = 0;

  // Read and parse the CSV file
  await new Promise((resolve, reject) => {
    fs.createReadStream('pcd-con-mp.csv')
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Read ${results.length} rows from CSV`);

  // Process in batches
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE).map(row => ({
      postcode: row.Postcode,
      mp: row['MP'],
      constituency: row.Constituency
    }));

    const { data, error } = await supabase
      .from('postcode_lookup')
      .upsert(batch, { onConflict: 'postcode' });

    if (error) {
      console.error(`Error upserting batch ${batches + 1}:`, error);
    } else {
      processed += batch.length;
      batches++;
      console.log(`Processed batch ${batches}: ${processed}/${results.length} rows`);
    }

    // Optional: Add a small delay between batches to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Upsert completed. Processed ${processed} rows in ${batches} batches.`);
}

upsertPostcodeLookup().catch(console.error);