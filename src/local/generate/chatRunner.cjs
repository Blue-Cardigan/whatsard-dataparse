const OpenAI = require('openai');
const { supabase } = require('./batchProcessor.cjs');
const { getPromptForCategory } = require('./getPrompt.cjs');
const translator = require('american-british-english-translator');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function translateContent(text, toBritish = true) {
  // Skip translation if text is empty or not a string
  if (!text || typeof text !== 'string') {
    return text;
  }

  const options = {
    british: toBritish,
    american: !toBritish,
    spelling: true,
    exclusive: false // Don't limit to dialect-exclusive words
  };
  
  // The translate function returns an object with translation info
  // We want to either use the translated text or keep the original if no changes needed
  const translationResult = translator.translate(text, options);
  
  // If no translations were needed, return original text
  if (!translationResult || Object.keys(translationResult).length === 0) {
    return text;
  }
  
  // Apply each translation to the text
  let translatedText = text;
  Object.entries(translationResult).forEach(([index, changes]) => {
    changes.forEach(change => {
      if (change.emphasised) {
        translatedText = translatedText.replace(
          change.emphasised.details, 
          change.emphasised.issue === 'British English Spelling' ? 
            change.emphasised.details.replace('z', 's') : 
            change.emphasised.details
        );
      }
    });
  });
  
  return translatedText;
}

// Add splitLongDebate function (similar to batchProcessor but simplified for chat)
function splitLongDebate(debate, maxChunkSize = 100000) {
  const { id, title, subtitle, category, speeches } = debate;
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;

  speeches.forEach(speech => {
    const speechJson = JSON.stringify(speech);
    if (currentSize + speechJson.length > maxChunkSize) {
      chunks.push({ 
        id, 
        title, 
        subtitle, 
        category, 
        speeches: currentChunk,
        isChunk: true,
        totalChunks: 0  // Will be set after all chunks are created
      });
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(speech);
    currentSize += speechJson.length;
  });

  if (currentChunk.length > 0) {
    chunks.push({ 
      id, 
      title, 
      subtitle, 
      category, 
      speeches: currentChunk,
      isChunk: true,
      totalChunks: 0 
    });
  }

  // Set totalChunks for each chunk
  chunks.forEach(chunk => chunk.totalChunks = chunks.length);
  return chunks;
}

// Modify processSingleDebateChat to handle chunks
async function processSingleDebateChat(debate, debateType, isRewrite = false) {
  const speechesJson = JSON.stringify(debate.speeches);
  const isLongDebate = speechesJson.length >= 100000;
  
  if (isLongDebate) {
    console.log(`Debate ${debate.id} is too long (${speechesJson.length} chars). Splitting into chunks...`);
    const chunks = splitLongDebate(debate);
    console.log(`Split into ${chunks.length} chunks`);
    
    const chunkResults = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Processing chunk ${i + 1}/${chunks.length} for debate ${debate.id}`);
      const chunkResult = await processDebateChunk(chunks[i], debateType, isRewrite, i);
      if (chunkResult) {
        chunkResults.push(chunkResult);
      }
    }
    
    return combineChunkResults(chunkResults, isRewrite);
  }

  // Original processing for normal-sized debates
  return processDebateChunk(debate, debateType, isRewrite);
}

// New function to process individual chunks
async function processDebateChunk(debate, debateType, isRewrite = false, chunkIndex = 0) {
  const { id, title, subtitle, category, speeches } = debate;
  
  if (speeches.length === 1 && !speeches[0].speakername) {
    console.log(`Skipping chunk ${chunkIndex} of debate ID: ${id} - Single speech with null speakername`);
    return null;
  }

  const content = `Title: ${title}\n\nSubtitle: ${subtitle}\n\nCategory: ${category}\n\nSpeeches:\n${JSON.stringify(speeches, null, 2)}`;

  const processes = isRewrite ? 
    ['rewrite'] : 
    ['analysis', 'labels'];

  const results = {};

  for (const processType of processes) {
    try {
      const prompt = getPromptForCategory(debateType, processType);
      
      let jsonInstructions;
      let functionSchema;

      if (processType === 'rewrite') {
        const expectedSpeeches = speeches.map(speech => ({
          speakername: speech.speakername,
          original_length: speech.content.length
        }));

        jsonInstructions = `Return a JSON object with a 'speeches' array containing exactly ${speeches.length} messages. 
Each message must match these requirements:
${expectedSpeeches.map((s, i) => `${i + 1}. Speaker: "${s.speakername}" (approximate length: ${s.original_length} chars)`).join('\n')}

Maintain the same order of speakers and approximate length ratios between speeches.`;

        functionSchema = {
          name: "get_rewritten_speeches",
          parameters: {
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
          }
        };
      } else if (processType === 'analysis') {
        jsonInstructions = `Return a JSON object with an 'analysis' field containing your analysis as a string.`;
        functionSchema = {
          name: "get_analysis",
          parameters: {
            type: "object",
            properties: {
              analysis: { type: "string" }
            },
            required: ["analysis"]
          }
        };
      } else if (processType === 'labels') {
        jsonInstructions = `Return a JSON object with 'topics' and 'tags' arrays directly.`;
        functionSchema = {
          name: "get_labels",
          parameters: {
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
          }
        };
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `${prompt}\n\n${jsonInstructions}` 
          },
          { 
            role: "user", 
            content: content 
          }
        ],
        functions: [functionSchema],
        function_call: { name: functionSchema.name }
      });

      const response = JSON.parse(completion.choices[0].message.function_call.arguments);

      // Translate content based on type
      if (processType === 'rewrite') {
        response.speeches = response.speeches.map(speech => ({
          ...speech,
          rewritten_speech: translateContent(speech.rewritten_speech, true)
        }));
      } else if (processType === 'analysis') {
        response.analysis = translateContent(response.analysis, true);
      } else if (processType === 'labels') {
        response.topics = response.topics.map(topic => translateContent(topic, true));
        response.tags = response.tags.map(tag => translateContent(tag, true));
      }

      results[processType] = response;
    } catch (error) {
      console.error(`Error processing ${processType} for debate ${id}:`, error);
    }
  }

  return results;
}

// New function to combine results from chunks
function combineChunkResults(chunkResults, isRewrite) {
  if (chunkResults.length === 0) return null;

  if (isRewrite) {
    return {
      rewrite: {
        speeches: chunkResults.flatMap(result => 
          result.rewrite ? result.rewrite.speeches : []
        )
      }
    };
  } else {
    return {
      analysis: {
        analysis: chunkResults
          .map(result => result.analysis?.analysis || '')
          .filter(Boolean)
          .join('\n\n')
      },
      labels: {
        topics: [...new Set(chunkResults.flatMap(result => 
          result.labels?.topics || []
        ))],
        tags: [...new Set(chunkResults.flatMap(result => 
          result.labels?.tags || []
        ))]
      }
    };
  }
}

// Modify updateDebateWithResults to handle combined results
async function updateDebateWithResults(id, debateType, results) {
  const updateData = {};

  if (results.rewrite) {
    updateData.rewritten_speeches = results.rewrite.speeches;
  } else {
    if (results.analysis) {
      updateData.analysis = results.analysis.analysis.trim();
    }
    if (results.labels) {
      updateData.topics = results.labels.topics;
      updateData.tags = results.labels.tags;
    }
  }

  const { error } = await supabase
    .from(debateType)
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error(`Error updating database for ID ${id}:`, error);
    return false;
  }
  return true;
}

async function runChatProcessing(batchSize, debateTypes, startDate, endDate, isRewrite = false) {
  const debateTypesArray = Array.isArray(debateTypes) ? debateTypes : [debateTypes];
  
  for (const debateType of debateTypesArray) {
    console.log(`Processing ${debateType}...`);
    
    // Build the query
    let query = supabase
      .from(debateType)
      .select('*')
      .filter('speeches', 'not.eq', '[]')
      .filter('speeches', 'not.eq', null);

    // Add date filters if provided
    if (startDate) {
      query = query.gte('id', `${debateType}${startDate}`);
    }
    if (endDate) {
      query = query.lte('id', `${debateType}${endDate}`);
    }

    // Add process-specific filters
    if (isRewrite) {
      query = query.is('rewritten_speeches', null);
    } else {
      // For analysis/labels, check if ANY of these are null
      query = query.or('analysis.is.null,topics.is.null,tags.is.null');
    }

    query = query.order('id', { ascending: true }).limit(batchSize);

    const { data: debates, error } = await query;

    if (error) {
      console.error(`Error fetching debates for ${debateType}:`, error);
      continue;
    }

    console.log(`Found ${debates.length} debates to process for ${debateType}`);

    for (const debate of debates) {
      console.log(`Processing debate ${debate.id}...`);
      const results = await processSingleDebateChat(debate, debateType, isRewrite);
      
      if (results) {
        const success = await updateDebateWithResults(debate.id, debateType, results);
        if (success) {
          console.log(`Successfully processed debate ${debate.id}`);
        }
      }
    }
  }
}

module.exports = {
  runChatProcessing
};