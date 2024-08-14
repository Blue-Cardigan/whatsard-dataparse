const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

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

function formatUrlPart(str) {
    return str ? encodeURIComponent(str.toLowerCase().replace(/ /g, '_')) : '';
}

async function scrapeTitles() {
  initSupabase(supabaseUrl, supabaseServiceKey);
  const { data: speakers, error } = await supabase
    .from('speakers')
    .select('id, name, constituency');

  if (error) {
    console.error('Error fetching speakers:', error);
    return;
  }

  for (const speaker of speakers) {
    if (!speaker.name || !speaker.constituency) {
      console.error(`Skipping speaker ${speaker.id}: Missing name or constituency`);
      continue;
    }

    const url = `https://www.theyworkforyou.com/mp/${speaker.id}/${formatUrlPart(speaker.name)}/${formatUrlPart(speaker.constituency)}`;

    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      const title = $('.person-header__about__known-for').text().trim();

      if (title) {
        const { error: updateError } = await supabase
          .from('speakers')
          .update({ title: title })
          .eq('id', speaker.id);

        if (updateError) {
          console.error(`Error updating speaker ${speaker.id}:`, updateError);
        } else {
          console.log(`Updated speaker ${speaker.id} with title: ${title}`);
        }
      } else {
        console.log(`No title found for speaker ${speaker.id}`);
      }
    } catch (error) {
      console.error(`Error scraping title for speaker ${speaker.id} at ${url}:`, error.message);
    }
  }
}

scrapeTitles();