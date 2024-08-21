// Double check script before running
const { prompts } = require('../../utils/prompts.js');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
require('dotenv').config();

const args = process.argv.slice(2);
const params = Object.fromEntries(args.map(arg => arg.split('=')));

const debateTypes = params.debateTypes === 'all' ? ['commons', 'lords', 'westminster', 'publicbills'] : params.debateTypes.split(',');
const batchSize = parseInt(params.batchSize) || 10; // Default to 10 if not specified
const startDate = params.startDate || null;
const endDate = params.endDate || null;

const categoryOptions = [
  { id: 'commons', name: 'House of Commons' },
  { id: 'westminster', name: 'Westminster Hall' },
  { id: 'lords', name: 'House of Lords' },
  { id: 'publicbills', name: 'Public Bill Committee' },
]

function getPromptForCategory(category, type) {
    const categoryName = categoryOptions.find(option => option.id === category)?.name || 'Unknown';
    if (type === 'analysis') {
      return `
        ###INSTRUCTIONS###
        Analyze this current UK ${categoryName} debate and provide a concise and engaging 100 word analysis.
        Use British English spelling.
        Explain the core topic, the stances of the main contributors, and the takeaway.
        Ensure your response is very short, structured, and easy to understand.
        Structure your response as JSON:
  
        {"analysis": "text"}
        ######
        `;
    } else if (type === 'labels') {
      return `
      ###INSTRUCTIONS###
      Analyze this UK ${categoryName} debate then provide 3 categories and 10 tags to identify the core topics.
      Use British English spelling. 
      Structure your response as JSON:
  
      
      {
        "labels": {
            "categories": ["category1", "category2", "category3"],
            "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
        }
      }

      ######
        `;
    }
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

async function fetchUnprocessedDebates(batchSize, debateType, startDate, endDate) {
  const query = supabase
    .from(debateType)
    .select('id, title, speeches')
    .is('analysis', null)
    .is('labels', null)
    .filter('speeches', 'not.eq', '[]')
    .filter('speeches', 'not.eq', null)
    .order('id', { ascending: true })
    .limit(batchSize);

  if (startDate) {
    query.gte('id', `${debateType}_${startDate}`);
  }
  if (endDate) {
    query.lte('id', `${debateType}_${endDate}`);
  }

  const { data, error } = await query;

  if (error) throw error;

  const filteredData = data.filter(debate => {
    const speechesJson = JSON.stringify(debate.speeches);
    return speechesJson.length < 100000;
  });

  console.log(`Fetched ${data.length} debates for ${debateType}, ${filteredData.length} within size limit`);

  return filteredData;
}

async function prepareBatchFile(debates, debateType) {
  const batchRequests = [];
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB limit
  let currentSize = 0;

  for (const debate of debates) {
    const { id, title, speeches } = debate;

    if (speeches.length === 1 && !speeches[0].speakername) {
      console.log(`Skipping processing for debate ID: ${id} - Single speech with null speakername`);
      continue;
    }

    const content = `Title: ${title}\n\nSpeeches:\n${JSON.stringify(speeches, null, 2)}`;

    const analysisRequest = JSON.stringify({
      custom_id: `${id}_analysis`,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-4o-2024-08-06",
        messages: [
          { role: "system", content: getPromptForCategory(debateType, 'analysis') },
          { role: "user", content: content }
        ],
        response_format: { type: "json_object" }
      }
    });

    const labelsRequest = JSON.stringify({
      custom_id: `${id}_labels`,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-4o-2024-08-06",
        messages: [
          { role: "system", content: getPromptForCategory(debateType, 'labels') },
          { role: "user", content: content }
        ],
        response_format: { type: "json_object" }
      }
    });

    if (currentSize + analysisRequest.length + labelsRequest.length > MAX_FILE_SIZE) {
      console.log(`Reached size limit. Stopping at ${batchRequests.length / 2} debates.`);
      break;
    }

    console.log(`Debate ID ${id} request length: ${analysisRequest.length + labelsRequest.length} characters`);
    batchRequests.push(analysisRequest, labelsRequest);
    currentSize += analysisRequest.length + labelsRequest.length + 2; // +2 for newlines
  }

  const batchFileContent = batchRequests.join('\n');
  console.log(`Total batch file length: ${batchFileContent.length} characters`);
  const fileName = `batchinput_${debateType}.jsonl`;
  await fsPromises.writeFile(fileName, batchFileContent);
  console.log(`Batch input file created: ${fileName}`);
  return fileName;
}

async function uploadBatchFile(fileName) {
    const filePath = path.join(process.cwd(), fileName);
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

const validDebateTypes = ['commons', 'lords', 'westminster', 'publicbills'];

async function updateDatabase(results, debateType) {
    for (const result of results) {
      const { custom_id, response } = result;
      if (response.status_code === 200) {
        const [id, type] = custom_id.split('_'); // Now correctly splitting ID and type
        const content = JSON.parse(response.body.choices[0].message.content);
        
        if (!validDebateTypes.includes(debateType)) {
          console.error(`Invalid debate type: ${debateType} for ID ${id}`);
          continue; // Skip this update
        }
  
        let updateData = {};
        if (type === 'analysis') {
          updateData.analysis = content.analysis;
        } else if (type === 'labels') {
          updateData.labels = content.labels;
        }
  
        console.log(`Updating ${debateType} table for ID ${id}`);
  
        const { error } = await supabase
          .from(debateType)
          .update(updateData)
          .eq('id', id);
        
        if (error) {
          console.error(`Error updating database for ID ${id} in ${debateType}:`, error);
        } else {
          console.log(`Updated ${type} for debate ID ${id} in ${debateType}`);
        }
      } else {
        console.error(`Error processing ID ${custom_id}:`, response.error);
      }
    }
  }

async function processSingleDebateType(debateType, batchSize, startDate, endDate) {
  const debates = await fetchUnprocessedDebates(batchSize, debateType, startDate, endDate);
  
  if (debates.length === 0) {
    console.log(`No unprocessed debates found for ${debateType} within specified date range and size limit.`);
    return;
  }

  const batchFileName = await prepareBatchFile(debates, debateType);
  const fileId = await uploadBatchFile(batchFileName);
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
}

async function main() {
  for (const debateType of debateTypes) {
    await processSingleDebateType(debateType, batchSize, startDate, endDate);
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