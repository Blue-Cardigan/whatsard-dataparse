// Run with
// node src/futz/gpt/viewbatches.js

import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  const list = await openai.batches.list();

  for await (const batch of list) {
    if (batch.created_at > 1724230885) {
      console.log(batch);
    }
  }
}

main();