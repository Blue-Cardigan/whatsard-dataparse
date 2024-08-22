// Note: Deno doesn't use dotenv in the same way as Node.js. 
// Environment variables are typically set through the runtime or deployment platform.

export const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
export const DATABASE_URL = Deno.env.get('DATABASE_URL');
export const SERVICE_KEY = Deno.env.get('SERVICE_KEY');
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const validDebateTypes = ['commons', 'lords', 'westminster', 'publicbills'];
export const categoryOptions = [
  { id: 'commons', name: 'House of Commons' },
  { id: 'westminster', name: 'Westminster Hall' },
  { id: 'lords', name: 'House of Lords' },
  { id: 'publicbills', name: 'Public Bill Committee' },
];
export const GENERATION_TYPES = ['speeches', 'analysis', 'labels'];

export default {
  OPENAI_API_KEY,
  DATABASE_URL,
  SERVICE_KEY,
  MAX_FILE_SIZE,
  validDebateTypes,
  categoryOptions,
  GENERATION_TYPES,
};