import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.DATABASE_URL, process.env.SERVICE_KEY);

async function updateSpeechesParallel(tableName) {
  let processed = 0;
  let updated = 0;
  let batchSize = 100;
  let lastId = '';

  while (true) {
    // Fetch a batch of records
    const { data: debates, error } = await supabase
      .from(tableName)
      .select('id, speeches, rewritten_speeches')
      .order('id')
      .gt('id', lastId)
      .limit(batchSize);

    if (error) {
      console.error(`Error fetching debates from ${tableName}:`, error);
      return;
    }

    if (debates.length === 0) {
      break; // No more records to process
    }

    for (const debate of debates) {
      processed++;
      lastId = debate.id;

      const speechesLength = Array.isArray(debate.speeches) ? debate.speeches.length : 0;
      const rewrittenSpeechesLength = Array.isArray(debate.rewritten_speeches) ? debate.rewritten_speeches.length : 0;

      const speechesparallel = speechesLength === rewrittenSpeechesLength && speechesLength > 0;

      // Update the record
      const { error: updateError } = await supabase
        .from(tableName)
        .update({ speechesparallel })
        .eq('id', debate.id);

      if (updateError) {
        console.error(`Error updating debate ${debate.id} in ${tableName}:`, updateError);
      } else {
        updated++;
      }
    }

    console.log(`${tableName}: Processed ${processed} debates, updated ${updated}`);
  }

  console.log(`${tableName}: Finished processing. Total processed: ${processed}, Total updated: ${updated}`);
}

async function updateAllTables() {
  const tables = ['commons', 'lords', 'westminster', 'publicbills'];
  
  for (const table of tables) {
    console.log(`Starting to process ${table} table`);
    await updateSpeechesParallel(table);
    console.log(`Finished processing ${table} table`);
  }
  
  console.log('All tables have been processed');
}

updateAllTables().catch(console.error);