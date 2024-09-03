require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;

// Get environment variables to initialize Supabase
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

async function storeIntroInSupabase(introData) {
  initSupabase(supabaseUrl, supabaseServiceKey);

  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { error } = await supabase.from('intro').upsert([introData]);
  if (error) throw error;
}

async function main(filePath) {
  try {
    // Read the JSON file
    const jsonData = await fs.readFile(filePath, 'utf8');
    const introData = JSON.parse(jsonData);

    // Store the data in Supabase
    await storeIntroInSupabase(introData);
    console.log(`Intro data from ${filePath} successfully stored in Supabase`);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Check if a file path argument is provided
const filePath = process.argv[2];
if (!filePath) {
  console.error('Please provide the path to the JSON file');
  process.exit(1);
}
main(filePath);