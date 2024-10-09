require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

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

function categorizeDebate(debate, debateType) {
  if (debateType !== 'publicbills') {
    if (debate.title && debate.title.startsWith('Petition - ')) {
        //   debate.title = debate.title.replace('Petition - ', '');
      return 'Petitions';
    }
    if ((debate.speeches && debate.speeches.length === 1) || 
        (debate.speaker_ids && debate.speaker_ids.length === 1)) {
      return 'Administration';
    }
  }

  if (debateType === 'commons') {
    if (debate.title && (debate.title.includes('Bill') || debate.title.toLowerCase().includes('royal assent') || debate.title.includes('Act'))) {
    //   debate.title = debate.title.replace(/\s*Bill\s*/, '').trim();
      return 'Bills & Legislation';
    }
    if (debate.title && ['Point of Order', 'Prayers', 'Business of the House'].some(phrase => debate.title.includes(phrase))) {
      return 'Administration';
    }
    if (debate.subtitle && debate.subtitle.includes('was asked—')) {
      return 'Oral Answers to Questions';
    }
  }

  if (debateType === 'lords') {
    if (debate.subtitle && (debate.title.includes('[HL]') || debate.title.includes('Amendment'))) {
    //   debate.subtitle = debate.subtitle.replace(/\s*Bill\s*/, '').trim();
      return 'Bills & Legislation';
    }
    //Motions
    if (debate.subtitle && debate.subtitle.includes('Motion')) {
        return 'Motions';
    }
    //question
    if (debate.subtitle && debate.subtitle.includes('Question')) {
      return 'Questions';
    }
    //statement
    if (debate.subtitle && debate.subtitle.includes('Statement')) {
      return 'Statements';
    }
    //report
    if (debate.subtitle && debate.subtitle.includes('Report')) {
      return 'Reports';
    }
  }

  return 'Main';
}

async function updateCategories(debateType) {
  initSupabase(supabaseUrl, supabaseServiceKey);

  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  let startIndex = 0;
  const batchSize = 1000;
  let totalUpdated = 0;

  while (true) {
    const { data: debates, error: fetchError } = await supabase
      .from(debateType)
      .select('id, title, subtitle, category')
    //   .is('category', null)
      .range(startIndex, startIndex + batchSize - 1);

    if (fetchError) {
      console.error(`Error fetching debates from ${debateType} table:`, fetchError);
      return;
    }

    if (debates.length === 0) {
      break;
    }

    const updatedDebates = debates.map(debate => ({
      id: debate.id,
      category: categorizeDebate(debate, debateType),
      title: debate.title
    }));

    const { error: upsertError } = await supabase
      .from(debateType)
      .upsert(updatedDebates, { onConflict: 'id' });

    if (upsertError) {
      console.error(`Error updating categories in ${debateType} table:`, upsertError);
      return;
    }

    totalUpdated += updatedDebates.length;
    console.log(`Updated ${totalUpdated} debates in ${debateType} table`);

    startIndex += batchSize;
  }

  console.log(`Finished updating categories for ${totalUpdated} debates in ${debateType} table`);
}

async function main() {
  const debateTypes = ['commons', 'lords', 'publicbills', 'westminster'];

  for (const debateType of debateTypes) {
    console.log(`Updating categories for ${debateType}...`);
    await updateCategories(debateType);
  }
}

main().catch(error => {
  console.error('An error occurred:', error);
  process.exit(1);
});