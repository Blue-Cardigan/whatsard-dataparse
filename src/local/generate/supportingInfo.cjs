const { fetchUnprocessedDebates, prepareBatchFile, updateDatabase, uploadBatchFile, createBatch, checkBatchStatus, retrieveResults } = require('./batchProcessor.cjs');
require('dotenv').config();

const args = process.argv.slice(2);

const categoryOptions = [
  { id: 'commons', name: 'House of Commons' },
  { id: 'westminster', name: 'Westminster Hall' },
  { id: 'lords', name: 'House of Lords' },
  { id: 'publicbills', name: 'Public Bill Committee' },
]

function getPromptForCategory(category, type) {
    const categoryName = categoryOptions.find(option => option.id === category)?.name || 'Unknown';
    const debateOrDiscussion = category === 'publicbills' ? 'discussion' : 'debate';
    if (type === 'analysis') {
      return `
        ###INSTRUCTIONS###
        Analyze this current UK ${categoryName} ${debateOrDiscussion} in 100 words or less.
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

async function processSingleDebateType(debateType, batchSize, startDate, endDate) {
  const debates = await fetchUnprocessedDebates(batchSize, debateType, startDate, endDate);
  
  if (debates.length === 0) {
    console.log(`No unprocessed debates found for ${debateType} within specified date range and size limit.`);
    return;
  }

  const batchFileName = await prepareBatchFile(debates, debateType, getPromptForCategory);
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

module.exports = { processSingleDebateType };