const { OpenAI } = require("openai");
const dotenv = require("dotenv");

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const createThread = async () => {
  try {
    const thread = await openai.beta.threads.create();
    console.log('Thread created:', thread.id);
    return thread.id;
  } catch (error) {
    console.error('Error creating thread:', error);
    throw error;
  }
}

// Make the function call when run as a standalone script
if (require.main === module) {
  createThread()
    .then(threadId => console.log('Thread ID:', threadId))
    .catch(error => console.error('Error:', error));
}

module.exports = { createThread };