const { prompts } = require('../../utils/prompts.js');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
require('dotenv').config();

const categoryOptions = [
  { id: 'commons', name: 'House of Commons' },
  { id: 'westminster', name: 'Westminster Hall' },
  { id: 'lords', name: 'House of Lords' },
  { id: 'writtenministerialstatements', name: 'Written Statements' },
  { id: 'writtenanswers', name: 'Written Answers' },
  { id: 'publicbillcommittee', name: 'Public Bill Committees' },
]

function getPromptForCategory(category) {
  const categoryName = categoryOptions.find(option => option.id === category)?.name || 'Unknown';
  return `
    ###INSTRUCTION###
    Rewrite these speeches from a UK ${categoryName} debate in the style of Whatsapp messages. Provide your response as JSON with keys for "speakername", and "rewritten_speech". 
    Clarify meaning which has been obfuscated by the original style. 
    Focus on data and key arguments.
    Use British English spelling with some emojis, and markdown formatting for long messages.

    Reduce the number of messages if necessary, but ensure all speakers are represented and all data and arguments are preserved. 
    
    Structure your response like this:
    [
        {
        "speakername": "text",
        "rewritten_speech": "text",
        },
        ...
    ]
    ######
    `;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fetchUnprocessedDebates(batchSize, debateType, startDate) {
  const query = supabase
    .from(debateType)
    .select('id, title, speeches, rewritten_speeches')
    .is('rewritten_speeches', null)
    .filter('speeches', 'not.eq', '[]')
    .filter('speeches', 'not.eq', null)
    .order('id', { ascending: false })
    .limit(batchSize);

  if (startDate) {
    query.gte('id', startDate);
  }

  const { data, error } = await query;

  if (error) throw error;

  const filteredData = data.filter(debate => {
    const speechesJson = JSON.stringify(debate.speeches);
    return speechesJson.length < 100000;
  });

  console.log(`Fetched ${data.length} debates, ${filteredData.length} within size limit`);

  return filteredData;
}

async function prepareBatchFile(debates) {
  const batchRequests = [];
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB limit
  let currentSize = 0;

  for (const debate of debates) {
    const { id, title, speeches } = debate;

    if (speeches.length === 1 && !speeches[0].speakername) {
      console.log(`Skipping processing for debate ID: ${id} - Single speech with null speakername`);
      continue;
    }

    // Remove 'time' parameter from speeches
    const speechesWithoutTime = speeches.map(({ time, ...rest }) => rest);

    const content = `Title: ${title}\n\nSpeeches:\n${JSON.stringify(speechesWithoutTime, null, 2)}`;

    const batchRequest = JSON.stringify({
      custom_id: id,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-4o-2024-08-06",
        messages: [
          { role: "system", content: getPromptForCategory(debateType) },
          { role: "user", content: content }
        ],
        response_format: { type: "json_object" }
      }
    });

    if (currentSize + batchRequest.length > MAX_FILE_SIZE) {
      console.log(`Reached size limit. Stopping at ${batchRequests.length} debates.`);
      break;
    }

    console.log(`Debate ID ${id} request length: ${batchRequest.length} characters`);
    batchRequests.push(batchRequest);
    currentSize += batchRequest.length + 1; // +1 for newline
  }

  const batchFileContent = batchRequests.join('\n');
  console.log(`Total batch file length: ${batchFileContent.length} characters`);

  await fsPromises.writeFile('batchinput.jsonl', batchFileContent);
  console.log('Batch input file created: batchinput.jsonl');
}

async function uploadBatchFile() {
  const filePath = path.join(process.cwd(), 'batchinput.jsonl');
  const stats = fs.statSync(filePath);
  console.log(`Uploading file with size: ${stats.size} bytes`);

  const stream = fs.createReadStream(filePath);

  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      const file = await openai.files.create({
        file: stream,
        purpose: 'batch'
      });
      console.log('File uploaded:', file);
      return file.id;
    } catch (error) {
      console.error(`Upload attempt ${retries + 1} failed:`, error.message);
      retries++;
      if (retries < maxRetries) {
        const delay = Math.pow(2, retries) * 1000; // Exponential backoff
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    } finally {
      stream.close();
    }
  }
}

async function createBatch(fileId) {
  const batch = await openai.batches.create({
    input_file_id: fileId,
    endpoint: "/v1/chat/completions",
    completion_window: "24h"
  });
  console.log('Batch created:', batch);
  return batch.id;
}

async function checkBatchStatus(batchId) {
  let batch;
  do {
    batch = await openai.batches.retrieve(batchId);
    console.log('Batch status:', batch.status);
    if (batch.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for 1 minute
    }
  } while (batch.status !== 'completed' && batch.status !== 'failed' && batch.status !== 'expired');
  return batch;
}

async function retrieveResults(fileId) {
  const fileResponse = await openai.files.content(fileId);
  const fileContents = await fileResponse.text();
  console.log('Raw file contents:', fileContents); // Log raw contents for debugging

  if (!fileContents.trim()) {
    console.error('Retrieved file is empty');
    return [];
  }

  const lines = fileContents.split('\n').filter(line => line.trim());
  console.log(`Number of result lines: ${lines.length}`);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      console.error(`Error parsing JSON on line ${index + 1}:`, error);
      console.error('Problematic line:', line);
      return null;
    }
  }).filter(result => result !== null);
}

async function updateDatabase(results, debateType) {
  for (const result of results) {
    const { custom_id, response } = result;
    if (response.status_code === 200) {
      const rewrittenSpeeches = JSON.parse(response.body.choices[0].message.content);
      const { error } = await supabase
        .from(debateType)
        .update({ rewritten_speeches: rewrittenSpeeches })
        .eq('id', custom_id);
      
      if (error) {
        console.error(`Error updating database for ID ${custom_id}:`, error);
      } else {
        console.log(`Updated database for ID ${custom_id}`);
      }
    } else {
      console.error(`Error processing ID ${custom_id}:`, response.error);
    }
  }
}

async function batchProcessDebates(batchSize, debateType, startDate) {
  try {
    const debates = await fetchUnprocessedDebates(batchSize, debateType, startDate);
    if (debates.length === 0) {
      console.log('No unprocessed debates found within size limit.');
      return;
    }
    
    await prepareBatchFile(debates);
    const fileId = await uploadBatchFile();
    const batchId = await createBatch(fileId);
    const completedBatch = await checkBatchStatus(batchId);
    
    if (completedBatch.status === 'completed') {
      const results = await retrieveResults(completedBatch.output_file_id);
      if (results.length === 0) {
        console.error('No valid results retrieved from the batch');
        return;
      }
      await updateDatabase(results, debateType);
      console.log('Batch processing completed successfully');
    } else {
      console.error('Batch processing failed or expired');
    }
  } catch (error) {
    console.error('Error in batch processing:', error);
  }
}

// Parse command line arguments
const batchSize = parseInt(process.argv[2], 10) || 100; // Default batch size to 100 if not provided
const debateType = process.argv[3] || 'both'; // Default to 'both' if not provided
const startDate = process.argv[4] || '2024-01-01'; // Default to '2024-01-01' if not provided

if (isNaN(batchSize) || batchSize <= 0) {
  console.error('Please provide a valid batch size as the first argument');
  process.exit(1);
}

if (!['commons', 'lords', 'both'].includes(debateType)) {
  console.error('Invalid debate type. Please use "commons", "lords", or "both"');
  process.exit(1);
}

async function main() {
  if (debateType === 'both') {
    await batchProcessDebates(batchSize, 'commons', startDate);
    await batchProcessDebates(batchSize, 'lords', startDate);
  } else {
    await batchProcessDebates(batchSize, debateType, startDate);
  }
}

main()
  .then(() => {
    console.log('Processing completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });