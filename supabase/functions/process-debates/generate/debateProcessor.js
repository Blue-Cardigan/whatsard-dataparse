import { getPromptForCategory } from './prompts.js';
import { MAX_FILE_SIZE } from './config.js';
import { writeFile } from 'https://deno.land/std@0.177.0/fs/mod.ts';

async function prepareBatchFile(debates, debateType, generationType) {
  const batchRequests = [];
  let currentSize = 0;

  for (const debate of debates) {
    const { id, title, speeches } = debate;

    if (speeches.length === 1 && !speeches[0].speakername) {
      console.log(`Skipping processing for debate ID: ${id} - Single speech with null speakername`);
      continue;
    }

    const content = `Title: ${title}\n\nSpeeches:\n${JSON.stringify(speeches, null, 2)}`;

    const request = JSON.stringify({
      custom_id: `${id}_${generationType}`,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-4o-2024-08-06",
        messages: [
          { role: "system", content: getPromptForCategory(debateType, generationType) },
          { role: "user", content: content }
        ],
        response_format: { type: "json_object" }
      }
    });

    if (currentSize + request.length > MAX_FILE_SIZE) {
      console.log(`Reached size limit. Stopping at ${batchRequests.length} debates.`);
      break;
    }

    console.log(`Debate ID ${id} request length: ${request.length} characters`);
    batchRequests.push(request);
    currentSize += request.length + 1; // +1 for newline
  }

  const batchFileContent = batchRequests.join('\n');
  console.log(`Total batch file length: ${batchFileContent.length} characters`);
  const fileName = `batchinput_${debateType}_${generationType}.jsonl`;
  await writeFile(fileName, new TextEncoder().encode(batchFileContent));
  console.log(`Batch input file created: ${fileName}`);
  return fileName;
}

export default {
  prepareBatchFile,
};