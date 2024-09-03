require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SYSTEM_DEBATE_MESSAGES = `
    ###INSTRUCTION###
    Rewrite these speeches from a UK Parliamentary debate in a casual style. Provide your response as JSON with keys for "speakername", and "rewritten_speech". 
    Clarify meaning which has been obfuscated by the original style. 
    Focus on data and key arguments.
    Use British English spelling with some emojis, and markdown formatting for long messages.

    Reduce the number of messages if necessary, but ensure all speakers are represented and all data and arguments are preserved. 
    
    Structure your response like this:
    {
        "speeches": [
            {
            "speakername": "text",
            "rewritten_speech": "text",
            },
            ...
        ]
    }
    ######
    `;

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

async function getSpeeches() {
  const text = fs.readFileSync('./sample.txt', 'utf8');
  return text;
}

async function rewriteDebateSpeeches(speeches) {
  try {
    const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content: `${SYSTEM_DEBATE_MESSAGES}\n ${speeches}` }],
        model: "gpt-4o-2024-08-06",
    });

    const rewrittenSpeeches = completion.choices[0];
    return rewrittenSpeeches;
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    throw error;
  }
}

async function main() {
  try {
    const speeches = await getSpeeches();
    console.log('Retrieved speeches:', speeches);

    const rewrittenSpeeches = await rewriteDebateSpeeches(speeches);
    // output to ./output.json
    fs.writeFileSync('./output.json', JSON.stringify(rewrittenSpeeches, null, 2));
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();