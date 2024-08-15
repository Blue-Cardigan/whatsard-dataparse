require('dotenv').config();
const { fetchUnprocessedDebates, updateDebate } = require('./utils/db');
const { logError, logInfo } = require('./utils/logging');
const { processBatch } = require('./batchprocessor');
const { getPromptForCategory } = require('./utils/prompts');
const { format, parse, isValid } = require('date-fns');

async function prepareBatchRequests(debates, generateTypes) {
  const batchRequests = {};

  for (const type of generateTypes) {
    batchRequests[type] = debates.map(debate => {
      const { id, title, speeches } = debate;
      const debateType = id.split('_')[0];
      let content;

      content = `Title: ${title}\n\nSpeeches:\n${JSON.stringify(speeches, null, 2)}`;

      return {
        custom_id: `${id}_${type}`,
        method: "POST",
        url: "/v1/chat/completions",
        body: {
          model: "gpt-4o-2024-08-06", // Changed to match generatemeta.js
          messages: [
            { role: "system", content: getPromptForCategory(debateType, type) },
            { role: "user", content: content }
          ],
          response_format: { type: "json_object" } // Changed to always use json_object
        }
      };
    });
  }

  return batchRequests;
}

async function processBatchResults(results, generateTypes) {
  for (const result of results) {
    const [debateId, type] = result.custom_id.split('_');
    const debateType = debateId.split('_')[0];
    try {
      const content = JSON.parse(result.response.body.choices[0].message.content);
      const updateData = {};

      if (type === 'speeches') {
        updateData.rewritten_speeches = content.speeches;
      } else if (type === 'analysis') {
        updateData.analysis = content.analysis;
      } else if (type === 'labels') {
        updateData.labels = content.labels;
      }

      await updateDebate(debateType, debateId, updateData);
      logInfo(`Updated ${type} for debate ${debateId}`);
    } catch (error) {
      logError(`Error updating ${type} for debate ${debateId}:`, error);
    }
  }
}

function parseArguments(args) {
  const parsedArgs = {
    debateType: ['commons', 'lords', 'westminster', 'publicbills'],
    batchSize: 10, // Default batch size
    date: null,
    endDate: null,
    generateTypes: ['speeches', 'analysis', 'labels'] // Default to generate all types
  };

  args.forEach(arg => {
    const [key, value] = arg.split('=');
    if (key === 'debateType') {
      parsedArgs.debateType = value.split(',').filter(type => 
        ['commons', 'lords', 'westminster', 'publicbills'].includes(type)
      );
    } else if (key === 'batchSize') {
      const size = parseInt(value, 10);
      if (!isNaN(size) && size > 0) {
        parsedArgs.batchSize = size;
      } else {
        console.warn(`Invalid batch size: ${value}. Using default of 10.`);
      }
    } else if (key === 'date' || key === 'endDate') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const date = parse(value, 'yyyy-MM-dd', new Date());
        if (isValid(date)) {
          parsedArgs[key] = value;
        } else {
          console.warn(`Invalid date for ${key}: ${value}. Ignoring.`);
        }
      } else {
        console.warn(`Invalid date format for ${key}: ${value}. Ignoring.`);
      }
    } else if (key === 'generate') {
      const types = value.split(',');
      parsedArgs.generateTypes = types.filter(type => 
        ['speeches', 'analysis', 'labels'].includes(type)
      );
      if (parsedArgs.generateTypes.length === 0) {
        console.warn('No valid generate types specified. Using all types.');
        parsedArgs.generateTypes = ['speeches', 'analysis', 'labels'];
      }
    }
  });

  return parsedArgs;
}

async function processDebateType(debateType, batchSize, startDate, endDate, generateTypes) {
  try {
    const debates = await fetchUnprocessedDebates(debateType, batchSize, startDate, endDate, generateTypes);
    logInfo(`Processing ${debates.length} debates for ${debateType}...`);

    if (debates.length === 0) {
      logInfo(`No unprocessed debates found for ${debateType}.`);
      return;
    }

    await processBatch(debates, generateTypes, prepareBatchRequests, processBatchResults);
    logInfo(`Completed processing for ${debateType}.`);
  } catch (error) {
    logError(`Error processing ${debateType}:`, error);
  }
}

async function main(args) {
  const { debateType, batchSize, date, endDate, generateTypes } = parseArguments(args);

  if (debateType.length === 0) {
    logError('Please provide at least one debate type.');
    process.exit(1);
  }

  logInfo(`Processing debate types: ${debateType.join(', ')}`);
  logInfo(`Batch size: ${batchSize}`);
  if (date) logInfo(`Starting from date: ${date}`);
  if (endDate) logInfo(`Ending at date: ${endDate}`);
  logInfo(`Generating: ${generateTypes.join(', ')}`);

  for (const type of debateType) {
    await processDebateType(type, batchSize, date, endDate, generateTypes);
  }

  logInfo('All processing completed.');
}

const args = process.argv.slice(2);

main(args).catch(logError);