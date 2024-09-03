const { processSingleDebateType } = require('./generate/supportingInfo.cjs');
const { batchProcessDebates } = require('./generate/batchProcessor.cjs');

async function runBothProcesses() {
  const args = process.argv.slice(2);
  const params = Object.fromEntries(args.map(arg => arg.split('=')));

  // Parameters for all processes
  const debateTypes = params.debateTypes === 'all' ? ['commons', 'lords', 'westminster', 'publicbills'] : params.debateTypes.split(',');
  const batchSize = parseInt(params.batchSize) || 32;
  const startDate = params.startDate || null;
  const endDate = params.endDate || null;

  console.log('Starting supportingInfo process (analysis and labels)...');
  for (const debateType of debateTypes) {
    await processSingleDebateType(debateType, batchSize, startDate, endDate, getPromptForCategory);
  }

  console.log('Starting mainChat process (rewrite)...');
  await batchProcessDebates(batchSize, debateTypes, startDate, getPromptForCategory);

  console.log('All processes completed.');
}

function getPromptForCategory(category, type) {
  const categoryOptions = [
    { id: 'commons', name: 'House of Commons' },
    { id: 'westminster', name: 'Westminster Hall' },
    { id: 'lords', name: 'House of Lords' },
    { id: 'publicbills', name: 'Public Bill Committee' },
  ];

  const categoryName = categoryOptions.find(option => option.id === category)?.name || 'Unknown';
  
  if (type === 'rewrite') {
    if (category === 'publicbills') {
      debateOrDiscussion = 'discussion'
    } else {
      debateOrDiscussion = 'debate'
    }
    return `
      ###INSTRUCTION###
      Rewrite these speeches from a UK ${categoryName} ${debateOrDiscussion} in the style of Whatsapp messages. 
      - Stay true to the original speaker's name and intention.
      - Keep the messages to-the-point. Remove superfluous phrases including "Thank you" or "I agree".
      - Use British English spelling.
      - Use markdown to highlight key data and arguments using bold, italics, and bullet points.
      - Use a serious tone for serious topics, such as violence or extreme poverty.
      - Use a light tone with one or two emojis if the topic is a light topic.
      
      Provide your response as JSON with keys for "speakername", and "rewritten_speech". 
      Reduce the number of messages if necessary, but ensure all speakers are represented and all data and arguments are preserved. 
      
      Structure your response like this:
      {
        "speeches": [
          {
          "speakername": "text",
          "rewritten_speech": "text"
          },
          ...
        ]
      }
      ######
      `;
  } else if (type === 'analysis') {
    return `
      ###INSTRUCTIONS###
      Analyze this current UK ${categoryName} debate in 100 words or less.
      Use British English spelling.
      Focus on both key characteristics and content, and the stances of the main contributors.
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

runBothProcesses()
  .then(() => {
    console.log('All processing completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });