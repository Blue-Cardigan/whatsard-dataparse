require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.DATABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_KEY;

let supabase = null;

function initSupabase() {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
}

const debateTypes = ['commons', 'lords', 'westminster', 'publicbills'];

async function updateRewrittenSpeeches() {
  initSupabase();

  for (const debateType of debateTypes) {
    console.log(`Processing ${debateType} debates...`);

    const { data: debates, error } = await supabase
      .from(debateType)
      .select('id, rewritten_speeches')
      .not('rewritten_speeches', 'is', null);

    if (error) {
      console.error(`Error fetching ${debateType} debates:`, error);
      continue;
    }

    for (const debate of debates) {
      if (debate.rewritten_speeches && typeof debate.rewritten_speeches === 'object') {
        let updatedSpeeches = debate.rewritten_speeches;

        // Check if it's already in the correct format
        if (Array.isArray(updatedSpeeches) && updatedSpeeches[0] && 'speakername' in updatedSpeeches[0]) {
          console.log(`${debateType} debate ${debate.id} is already in the correct format`);
          continue;
        }

        // If it's not an array, get the first (and should be only) value
        if (!Array.isArray(updatedSpeeches)) {
          const keys = Object.keys(updatedSpeeches);
          if (keys.length === 1) {
            updatedSpeeches = updatedSpeeches[keys[0]];
          }
        }

        // If it's a single object starting with {"speakername"..., wrap it in an array
        if (!Array.isArray(updatedSpeeches) && updatedSpeeches && typeof updatedSpeeches === 'object' && 'speakername' in updatedSpeeches) {
          updatedSpeeches = [updatedSpeeches];
        }

        // Ensure updatedSpeeches is an array
        if (!Array.isArray(updatedSpeeches)) {
          console.log(`${debateType} debate ${debate.id} is not in the expected format`);
          continue;
        }

        const { error: updateError } = await supabase
          .from(debateType)
          .update({ rewritten_speeches: updatedSpeeches })
          .eq('id', debate.id);

        if (updateError) {
          console.error(`Error updating ${debateType} debate ${debate.id}:`, updateError);
        } else {
          console.log(`Updated ${debateType} debate ${debate.id}`);
        }
      } else {
        console.log(`${debateType} debate ${debate.id} is not in the expected format or is empty`);
      }
    }

    console.log(`Finished processing ${debateType} debates`);
  }

  console.log('Update process completed for all debate types');
}

updateRewrittenSpeeches().catch(console.error);