require('dotenv').config();

module.exports = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
  SERVICE_KEY: process.env.SERVICE_KEY,
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