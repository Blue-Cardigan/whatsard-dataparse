require('dotenv').config();

module.exports = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  MAX_FILE_SIZE: 25 * 1024 * 1024,
  validDebateTypes: ['commons', 'lords', 'westminster', 'publicbills'],
  categoryOptions: [
    { id: 'commons', name: 'House of Commons' },
    { id: 'westminster', name: 'Westminster Hall' },
    { id: 'lords', name: 'House of Lords' },
    { id: 'publicbills', name: 'Public Bill Committee' },
  ],
  GENERATION_TYPES: ['speeches', 'analysis', 'labels'],
};