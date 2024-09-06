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
  const twelveHoursAgo = Math.floor(Date.now() / 1000) - 12 * 60 * 60;

  for await (const batch of list) {
    if (batch.created_at > twelveHoursAgo) {
      console.log(batch);
    }
  }
}

main();