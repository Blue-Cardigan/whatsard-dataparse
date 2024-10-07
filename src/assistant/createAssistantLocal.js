import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir, readFile } from 'fs/promises';
import { Readable } from 'stream';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { createReadStream } from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

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
  const transcriptsDir = join(__dirname, '.', 'transcripts');

  try {
    const files = await readdir(transcriptsDir);
    const txtFiles = files.filter(file => file.endsWith('.txt'));

    for (let i = 0; i < txtFiles.length; i += chunkSize) {
      const chunk = txtFiles.slice(i, i + chunkSize);

      const fileStreams = await Promise.all(chunk.map(async file => {
        const filePath = join(transcriptsDir, file);
        try {
          return createReadStream(filePath);
        } catch (error) {
          console.error(`Error creating stream for file ${file}:`, error);
          return null;
        }
      }));

      const validFileStreams = fileStreams.filter(stream => stream !== null);

      if (validFileStreams.length > 0) {
        try {
          // Upload files and poll until processing is complete
          await openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStore.id, { files: validFileStreams });
          console.log(`Uploaded ${validFileStreams.length} files from transcripts`);
        } catch (error) {
          console.error(`Error uploading files from transcripts:`, error);
        }
      } else {
        console.log(`No valid files to upload in this chunk`);
      }
    }
  } catch (error) {
    console.error(`Error reading transcripts directory:`, error);
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