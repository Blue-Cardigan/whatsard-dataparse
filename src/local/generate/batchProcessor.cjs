const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const translator = require('american-british-english-translator');
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

// Add new translation helper function
function translateContent(text, toBritish = true) {
  const options = {
    british: toBritish,
    american: !toBritish,
    spelling: true
  };
  
  const translated = translator.translate(text, options);
  return translated;
}

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
      if (batch.output_file_id) {
        console.log('Batch output_file_id:', batch.output_file_id);
      }
      if (batch.status !== 'completed') {
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait for 10 seconds
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
      // Check for null analysis, topics, and tags instead of labels
      query.is('analysis', null)
           .is('topics', null)
           .is('tags', null);
    }
  
    if (startDate) {
      query.gte('id', `${debateType}${startDate}`);
    }
    if (endDate) {
      query.lte('id', `${debateType}${endDate}`);
    }
  
    const { data, error } = await query;
  
    if (error) throw error;
  
    const longDebates = [];
    const filteredData = data.filter(debate => {
      const speechesJson = JSON.stringify(debate.speeches);
      if (speechesJson.length >= 100000) {
        longDebates.push(debate);
        return false;
      }
      return true;
    });
  
    console.log(`Fetched ${data.length} debates for ${debateType}, ${filteredData.length} within size limit, ${longDebates.length} marked for splitting`);
  
    return { filteredData, longDebates };
  }

function splitLongDebate(debate, maxChunkSize = 100000) {
  const { id, title, speeches } = debate;
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;

  speeches.forEach(speech => {
    const speechJson = JSON.stringify(speech);
    if (currentSize + speechJson.length > maxChunkSize) {
      chunks.push({ id, title, speeches: currentChunk });
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(speech);
    currentSize += speechJson.length;
  });

  if (currentChunk.length > 0) {
    chunks.push({ id, title, speeches: currentChunk });
  }

  return chunks;
}

async function prepareBatchFile(debates, debateType, getPromptForCategory, isRewritten = false) {
  const batchRequests = [];
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB limit
  let currentSize = 0;

  for (const debate of debates) {
    const debateChunks = debate.speeches.length >= 50000 ? splitLongDebate(debate) : [debate];

    for (let chunkIndex = 0; chunkIndex < debateChunks.length; chunkIndex++) {
      const chunk = debateChunks[chunkIndex];
      const { id, title, subtitle, category, speeches } = chunk;

      if (speeches.length === 1 && !speeches[0].speakername) {
        console.log(`Skipping processing for debate ID: ${id} - Single speech with null speakername`);
        continue;
      }

      const content = `Title: ${title}\n\nSubtitle: ${subtitle}\n\nCategory: ${category}\n\nSpeeches:\n${JSON.stringify(speeches, null, 2)}`;

      const createRequestBody = (customId, category) => {
        const prompt = getPromptForCategory(debateType, category, chunkIndex);
        
        let jsonInstructions;
        let responseSchema;

        if (category === 'rewrite') {
          // Create a structure template based on the original speeches
          const expectedSpeeches = speeches.map(speech => ({
            speakername: speech.speakername,
            original_length: speech.content.length
          }));

          jsonInstructions = `Return a JSON object with a 'speeches' array containing exactly ${speeches.length} messages. 
Each message must match these requirements:
${expectedSpeeches.map((s, i) => `${i + 1}. Speaker: "${s.speakername}" (approximate length: ${s.original_length} chars)`).join('\n')}

Maintain the same order of speakers and approximate length ratios between speeches.`;

          responseSchema = {
            type: "object",
            properties: {
              speeches: {
                type: "array",
                minItems: speeches.length,
                maxItems: speeches.length,
                items: {
                  type: "object",
                  properties: {
                    speakername: { 
                      type: "string",
                      enum: speeches.map(s => s.speakername)
                    },
                    rewritten_speech: { type: "string" }
                  },
                  required: ["speakername", "rewritten_speech"]
                }
              }
            },
            required: ["speeches"]
          };
        } else if (category === 'analysis') {
          jsonInstructions = `Return a JSON object with an 'analysis' field containing your analysis as a string.`;
          responseSchema = {
            type: "object",
            properties: {
              analysis: { type: "string" }
            },
            required: ["analysis"]
          };
        } else if (category === 'labels') {
          jsonInstructions = `Return a JSON object with 'topics' and 'tags' arrays directly.`;
          responseSchema = {
            type: "object",
            properties: {
              topics: { 
                type: "array",
                items: { type: "string" }
              },
              tags: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: ["topics", "tags"]
          };
        }

        return {
          custom_id: customId,
          method: "POST",
          url: "/v1/chat/completions",
          body: {
            model: "gpt-4o",  // gpt-4o is the correct model name
            messages: [
              { 
                role: "system", 
                content: `${prompt}\n\n${jsonInstructions}\nEnsure your response is valid JSON matching the required structure.` 
              },
              { 
                role: "user", 
                content: content 
              }
            ],
            response_format: {
              type: "json_object"
            }
          }
        };
      };

      const customId = `${id}_chunk${chunkIndex}_${isRewritten ? 'rewrite' : 'analysis'}`;
      const analysisRequest = JSON.stringify(createRequestBody(customId, isRewritten ? 'rewrite' : 'analysis'));

      if (currentSize + analysisRequest.length > MAX_FILE_SIZE) {
        console.log(`Reached size limit. Stopping at ${batchRequests.length} debates.`);
        break;
      }

      console.log(`Debate ID ${id} chunk ${chunkIndex} request length: ${analysisRequest.length} characters`);
      batchRequests.push(analysisRequest);
      currentSize += analysisRequest.length + 1; // +1 for newline

      if (!isRewritten) {
        const labelsRequest = JSON.stringify(createRequestBody(`${id}_chunk${chunkIndex}_labels`, 'labels'));
        batchRequests.push(labelsRequest);
        currentSize += labelsRequest.length + 1;
      }
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
  const combinedResults = {};

  for (const result of results) {
    const { custom_id, response } = result;
    if (response.status_code === 200) {
      const [id, chunk, type] = custom_id.split('_');
      let content;
      try {
        content = JSON.parse(response.body.choices[0].message.content);
        
        // Translate content based on type
        if (isRewritten) {
          content.speeches = content.speeches.map(speech => ({
            ...speech,
            rewritten_speech: translateContent(speech.rewritten_speech, true)
          }));
        } else if (type === 'analysis') {
          content.analysis = translateContent(content.analysis, true);
        } else if (type === 'labels') {
          // Directly handle topics and tags arrays
          content.topics = content.topics.map(topic => 
            translateContent(topic, true)
          );
          content.tags = content.tags.map(tag => 
            translateContent(tag, true)
          );
        }
      } catch (error) {
        console.error(`Error processing content for ID ${custom_id}:`, error);
        console.error('Skipping this result and continuing with the next one');
        continue;
      }

      if (!combinedResults[id]) {
        combinedResults[id] = { 
          analysis: '', 
          topics: [], 
          tags: [], 
          rewritten_speeches: [], 
          speechesParallel: [] 
        };
      }

      if (isRewritten) {
        combinedResults[id].rewritten_speeches = combinedResults[id].rewritten_speeches.concat(content.speeches);
        combinedResults[id].speechesParallel = combinedResults[id].speechesParallel.concat(content.speechesParallel || []);
      } else if (type === 'analysis') {
        combinedResults[id].analysis += content.analysis + '\n\n';
      } else if (type === 'labels') {
        // Combine topics and tags arrays
        combinedResults[id].topics = Array.from(new Set([
          ...combinedResults[id].topics,
          ...content.topics
        ]));
        combinedResults[id].tags = Array.from(new Set([
          ...combinedResults[id].tags,
          ...content.tags
        ]));
      }
    } else {
      console.error(`Error processing ID ${custom_id}:`, response.error);
    }
  }

  for (const id in combinedResults) {
    const updateData = {};
    if (isRewritten) {
      updateData.rewritten_speeches = combinedResults[id].rewritten_speeches;
    } else {
      updateData.analysis = combinedResults[id].analysis.trim();
      // Convert arrays to PostgreSQL array type
      updateData.topics = combinedResults[id].topics;
      updateData.tags = combinedResults[id].tags;
    }

    try {
      const { error } = await supabase
        .from(debateType)
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error(`Error updating database for ID ${id} in ${debateType}:`, error);
      } else {
        console.log(`Updated ${
          isRewritten ? 'rewritten speeches and speechesparallel' : 
          'analysis, topics, and tags'
        } for debate ID ${id} in ${debateType}`);
      }
    } catch (error) {
      console.error(`Unexpected error updating database for ID ${id} in ${debateType}:`, error);
    }
  }
}

async function fetchErrorFile(errorFileId) {
  try {
    const errorFileResponse = await openai.files.content(errorFileId);
    const errorFileContents = await errorFileResponse.text();
    console.log('Error file contents:', errorFileContents);
  } catch (error) {
    console.error('Error fetching error file:', error);
  }
}

async function batchProcessDebates(batchSize, debateTypes, startDate, getPromptForCategory) {
  try {
    const allDebates = [];
    const longDebates = [];
    const debateTypesArray = Array.isArray(debateTypes) ? debateTypes : [debateTypes];
    const debatesPerType = Math.ceil(batchSize / debateTypesArray.length);
    const MAX_TOTAL_DEBATES = batchSize;

    for (const debateType of debateTypesArray) {
      const { filteredData, longDebates: typeLongDebates } = await fetchUnprocessedDebates(debatesPerType, debateType, startDate, null, true);
      allDebates.push(...filteredData);
      longDebates.push(...typeLongDebates);
    }

    if (allDebates.length === 0 && longDebates.length === 0) {
      console.log('No unprocessed debates found within size limit.');
      return;
    }
    
    if (allDebates.length > MAX_TOTAL_DEBATES) {
      allDebates = allDebates.slice(0, MAX_TOTAL_DEBATES);
    }
    
    const fileName = await prepareBatchFile([...allDebates, ...longDebates], debateTypes[0], getPromptForCategory, true);
    const fileId = await uploadBatchFile(fileName);
    const batchId = await createBatch(fileId);
    const completedBatch = await checkBatchStatus(batchId);
    
    if (completedBatch.status === 'completed') {
      if (completedBatch.output_file_id) {
        const results = await retrieveResults(completedBatch.output_file_id);
        if (results.length === 0) {
          console.error('No valid results retrieved from the batch');
          return;
        }
        for (const result of results) {
          try {
            const debateType = debateTypesArray.find(type => result.custom_id.startsWith(type));
            await updateDatabase([result], debateType, true);
          } catch (error) {
            console.error('Error processing individual result:', error);
            console.error('Problematic result:', result.custom_id);
          }
        }
        console.log('Batch processing completed successfully');
      } else if (completedBatch.error_file_id) {
        console.error('Batch completed with errors. Fetching error file...');
        await fetchErrorFile(completedBatch.error_file_id);
      } else {
        console.error('Batch completed but no output or error file ID found');
      }
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
  fetchErrorFile, // Export the new function
};
