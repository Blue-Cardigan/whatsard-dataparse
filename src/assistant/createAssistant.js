import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFile } from 'fs/promises';
import { Readable } from 'stream';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
const supabaseUrl = process.env.DATABASE_URL;
const supabaseServiceKey = process.env.SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fetchDataFromSupabase(table) {
  const { data, error } = await supabase
    .from(table)
    .select('title, type, speaker_names, speeches, id')
    .gte('id', '2024-09-01');

  if (error) {
    console.error(`Error fetching data from ${table}:`, error);
    return [];
  }

  return data;
}

function formatTranscript(debate) {
  const { title, type, speaker_names, speeches } = debate;
  let transcript = `Title: ${title}\nType: ${type}\nSpeakers: ${speaker_names.join(', ')}\n\n`;

  if (Array.isArray(speeches)) {
    speeches.forEach(speech => {
      transcript += `${speech.time} - ${speech.speakername}: ${speech.content}\n\n`;
    });
  } else {
    console.warn(`Speeches data is not an array for debate ID: ${debate.id}`);
  }

  return transcript;
}

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

async function createAssistant() {
  const vectorStore = await openai.beta.vectorStores.create({
    name: "Document Store",
  });

  const chunkSize = 400;
  const tables = ['commons', 'lords', 'publicbills', 'westminster'];

  for (const table of tables) {
    const supabaseData = await fetchDataFromSupabase(table);

    // Process Supabase data in chunks
    for (let i = 0; i < supabaseData.length; i += chunkSize) {
      const chunk = supabaseData.slice(i, i + chunkSize);

      for (const debate of chunk) {
        const transcript = formatTranscript(debate);
        const filePath = join(__dirname, '.', 'transcripts', `${debate.id}.txt`);
        await writeFile(filePath, transcript);
        console.log(`Saved transcript for ${debate.id} to ${filePath}`);
      }

      const fileStreams = chunk.map(debate => {
        if (Array.isArray(debate.speeches)) {
          const speeches = debate.speeches.map(speech => speech.content).join('\n');
          return bufferToStream(Buffer.from(speeches));
        } else {
          console.warn(`Speeches data is not an array for debate ID: ${debate.id}`);
          return null;
        }
      }).filter(stream => stream !== null);

      if (fileStreams.length > 0) {
        try {
          // Upload files and poll until processing is complete
          await openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStore.id, { files: fileStreams });
          console.log(`Uploaded ${chunk.length} files from ${table}`);
        } catch (error) {
          console.error(`Error uploading files from ${table}:`, error);
        }
      } else {
        console.warn(`No valid files to upload for chunk starting at index ${i} from table ${table}`);
      }
    }
  }

  // Create the assistant
  const assistant = await openai.beta.assistants.create({
    name: "Hansard Analyst",
    instructions: "You are an expert in the UK Parliamentary Process and Hansard debates. Provide concise answers based on the provided documents. Use British English spelling.",
    model: "gpt-4o",
    tools: [{ type: "file_search" }]
  });

  await openai.beta.assistants.update(assistant.id, {
    tool_resources: { file_search: { vector_store_ids: [vectorStore.id] } },
  });

  console.log("Assistant created with ID:", assistant.id);
}

createAssistant().catch(console.error);