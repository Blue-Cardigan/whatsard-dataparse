const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const fsPromises = require('fs').promises;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase client
const supabase = createClient(
  process.env.DATABASE_URL,
  process.env.SERVICE_KEY
);

async function uploadBatchFile(filename) {
    const filePath = path.join(process.cwd(), filename);
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
        console.log('File uploaded:', file.id);
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

async function fetchUnprocessedDebates(batchSize, debateType, startDate, endDate, isRewritten = false) {
  const query = supabase
    .from(debateType)
    .select('id, title, speeches')
    .filter('speeches', 'not.eq', '[]')
    .filter('speeches', 'not.eq', null)
    .order('id', { ascending: true })
    .limit(batchSize);

  if (isRewritten) {
    query.is('rewritten_speeches', null);
  } else {
    query.is('analysis', null).is('labels', null);
  }

  if (startDate) {
    query.gte('id', `${debateType}${startDate}`);
  }
  if (endDate) {
    query.lte('id', `${debateType}${endDate}`);
  }
  console.log(query);

  const { data, error } = await query;

  if (error) throw error;

  const filteredData = data.filter(debate => {
    const speechesJson = JSON.stringify(debate.speeches);
    return speechesJson.length < 100000;
  });

  console.log(`Fetched ${data.length} debates for ${debateType}, ${filteredData.length} within size limit`);

  return filteredData;
}

async function prepareBatchFile(debates, debateType, getPromptForCategory, isRewritten = false) {
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

    const requestBody = {
      custom_id: isRewritten ? id : `${id}_analysis`,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-4o",
        messages: [
          { role: "system", content: getPromptForCategory(debateType, isRewritten ? 'rewrite' : 'analysis') },
          { role: "user", content: content }
        ],
        response_format: { type: "json_object" }
      }
    };

    const request = JSON.stringify(requestBody);

    if (currentSize + request.length > MAX_FILE_SIZE) {
      console.log(`Reached size limit. Stopping at ${batchRequests.length} debates.`);
      break;
    }

    console.log(`Debate ID ${id} request length: ${request.length} characters`);
    batchRequests.push(request);
    currentSize += request.length + 1; // +1 for newline

    if (!isRewritten) {
      const labelsRequest = JSON.stringify({
        ...requestBody,
        custom_id: `${id}_labels`,
        body: {
          ...requestBody.body,
          messages: [
            { role: "system", content: getPromptForCategory(debateType, 'labels') },
            { role: "user", content: content }
          ]
        }
      });
      batchRequests.push(labelsRequest);
      currentSize += labelsRequest.length + 1;
    }
  }

  const batchFileContent = batchRequests.join('\n');
  console.log(`Total batch file length: ${batchFileContent.length} characters`);
  const fileName = `batchinput_${debateType}${isRewritten ? '_rewritten' : ''}.jsonl`;
  await fsPromises.writeFile(fileName, batchFileContent);
  console.log(`Batch input file created: ${fileName}`);
  return fileName;
}

async function updateDatabase(results, debateType, isRewritten = false) {
  for (const result of results) {
    const { custom_id, response } = result;
    if (response.status_code === 200) {
      const [id, type] = custom_id.split('_');
      const content = JSON.parse(response.body.choices[0].message.content);
      
      let updateData = {};
      if (isRewritten) {
        let rewrittenSpeeches = content;
        if (rewrittenSpeeches.speeches && Array.isArray(rewrittenSpeeches.speeches)) {
          rewrittenSpeeches = rewrittenSpeeches.speeches;
        }
        updateData.rewritten_speeches = rewrittenSpeeches;
      } else if (type === 'analysis') {
        updateData.analysis = content.analysis;
      } else if (type === 'labels') {
        updateData.labels = content.labels;
      }

      const { error } = await supabase
        .from(debateType)
        .update(updateData)
        .eq('id', id);
      
      if (error) {
        console.error(`Error updating database for ID ${id} in ${debateType}:`, error);
      } else {
        console.log(`Updated ${isRewritten ? 'rewritten speeches' : type} for debate ID ${id} in ${debateType}`);
      }
    } else {
      console.error(`Error processing ID ${custom_id}:`, response.error);
    }
  }
}

async function batchProcessDebates(batchSize, debateTypes, startDate, getPromptForCategory) {
  try {
    const allDebates = [];
    const debateTypesArray = Array.isArray(debateTypes) ? debateTypes : [debateTypes];
    const debatesPerType = Math.ceil(batchSize / debateTypesArray.length);
    const MAX_TOTAL_DEBATES = batchSize;

    for (const debateType of debateTypesArray) {
      const debates = await fetchUnprocessedDebates(debatesPerType, debateType, startDate, null, true);
      allDebates.push(...debates);
    }

    if (allDebates.length === 0) {
      console.log('No unprocessed debates found within size limit.');
      return;
    }
    
    if (allDebates.length > MAX_TOTAL_DEBATES) {
      allDebates = allDebates.slice(0, MAX_TOTAL_DEBATES);
    }
    
    const fileName = await prepareBatchFile(allDebates, debateTypes[0], getPromptForCategory, true);
    const fileId = await uploadBatchFile(fileName);
    const batchId = await createBatch(fileId);
    const completedBatch = await checkBatchStatus(batchId);
    
    if (completedBatch.status === 'completed') {
      const results = await retrieveResults(completedBatch.output_file_id);
      if (results.length === 0) {
        console.error('No valid results retrieved from the batch');
        return;
      }
      for (const result of results) {
        const debateType = debateTypesArray.find(type => result.custom_id.startsWith(type));
        await updateDatabase([result], debateType, true);
      }
      console.log('Batch processing completed successfully');
    } else {
      console.error('Batch processing failed or expired');
    }
  } catch (error) {
    console.error('Error in batch processing:', error);
  }
}

module.exports = {
  openai,
  supabase,
  uploadBatchFile,
  createBatch,
  checkBatchStatus,
  retrieveResults,
  fetchUnprocessedDebates,
  prepareBatchFile,
  updateDatabase,
  batchProcessDebates,
};