require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.DATABASE_URL, process.env.SERVICE_KEY);

const BATCH_SIZE = 1000; // Adjust based on your needs and Supabase plan

async function removePostcodeSpaces() {
  let processed = 0;
  let batches = 0;
  let hasMore = true;
  let lastPostcode = '';

  while (hasMore) {
    // Fetch a batch of postcodes
    const { data, error } = await supabase
      .from('postcode_lookup')
      .select('postcode')
      .order('postcode')
      .gt('postcode', lastPostcode)
      .limit(BATCH_SIZE);

    if (error) {
      console.error('Error fetching postcodes:', error);
      return;
    }

    if (data.length === 0) {
      hasMore = false;
      continue;
    }

    // Process the batch
    const updates = data.map(row => ({
      oldPostcode: row.postcode,
      newPostcode: row.postcode.replace(/\s/g, '')
    })).filter(row => row.oldPostcode !== row.newPostcode);

    for (const update of updates) {
      const { error } = await supabase
        .from('postcode_lookup')
        .update({ postcode: update.newPostcode })
        .eq('postcode', update.oldPostcode);

      if (error) {
        console.error(`Error updating postcode ${update.oldPostcode}:`, error);
      } else {
        processed++;
      }
    }

    batches++;
    lastPostcode = data[data.length - 1].postcode;
    console.log(`Processed batch ${batches}: ${processed} postcodes updated`);

    // Optional: Add a small delay between batches to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`Update completed. Processed ${processed} postcodes in ${batches} batches.`);
}

removePostcodeSpaces().catch(console.error);