// Run with eg
// node src/local/generate.cjs startDate=2024-09-02 debateType=commons

const { processSingleDebateType } = require('./generate/supportingInfo.cjs');
const { batchProcessDebates } = require('./generate/batchProcessor.cjs');

async function runBothProcesses() {
  const args = process.argv.slice(2);
  const params = Object.fromEntries(args.map(arg => arg.split('=')));

  // Parameters for all processes
  const debateType = params.debateType ? 
    (params.debateType === 'all' ? ['commons', 'lords', 'westminster', 'publicbills'] : params.debateType.split(','))
    : ['commons', 'lords', 'westminster', 'publicbills'];
  const batchSize = parseInt(params.batchSize) || 32;
  const startDate = params.startDate || null;
  const endDate = params.endDate || null;

  console.log('Starting supportingInfo process (analysis and labels)...');
  for (const type of debateType) {
    await processSingleDebateType(type, batchSize, startDate, endDate, getPromptForCategory);
  }

  console.log('Starting mainChat process (rewrite)...');
  await batchProcessDebates(batchSize, debateType, startDate, getPromptForCategory);

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
    Analyze this UK ${categoryName} ${debateOrDiscussion} then provide up to 5 topics and up to 10 tags to use as metadata.
    Use British English spelling. 

    #Select Topics From this List Only#
      Environment and Natural Resources
      Healthcare and Social Welfare
      Economy, Business, and Infrastructure
      Science, Technology, and Innovation
      Legal Affairs and Public Safety
      International Relations and Diplomacy
      Parliamentary Affairs and Governance
      Education, Culture, and Society
    #
    
    #Tags
      Identify subtopics within the selected topics. 
      Avoid overlapping tags such as "recall petition" and "petition officer"
      Avoid broad tags like "Parliamentary debate" or "Official Report".
    #

    Structure your response as JSON:

    {
      "labels": {
        "topics": ["Topic1", "Topic2", "More topics if needed"],
        "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5", "More tags if needed"]
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