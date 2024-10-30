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

async function processSingleDebateChat(debate, debateType, isRewrite = false) {
  const { id, title, subtitle, category, speeches } = debate;
  
  if (speeches.length === 1 && !speeches[0].speakername) {
    console.log(`Skipping debate ID: ${id} - Single speech with null speakername`);
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

async function updateDebateWithResults(id, debateType, results) {
  const updateData = {};

  if (results.rewrite) {
    updateData.rewritten_speeches = results.rewrite.speeches;
  } else {
    if (results.analysis) {
      updateData.analysis = results.analysis.analysis;
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
    
    const query = supabase
      .from(debateType)
      .select('*')
      .filter('speeches', 'not.eq', '[]')
      .filter('speeches', 'not.eq', null)
      .order('id', { ascending: true })
      .limit(batchSize);

    if (isRewrite) {
      query.is('rewritten_speeches', null);
    } else {
      query.is('analysis', null)
           .is('topics', null)
           .is('tags', null);
    }

    if (startDate) query.gte('id', `${debateType}${startDate}`);
    if (endDate) query.lte('id', `${debateType}${endDate}`);

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