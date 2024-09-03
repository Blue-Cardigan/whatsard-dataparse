const OpenAI = require('openai');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  const list = await openai.batches.list();

  for await (const batch of list) {
    console.log(batch);
  }
}

main();