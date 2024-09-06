const OpenAI = require('openai');
const fs = require('fs').promises;
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase client
const supabase = createClient(
  process.env.DATABASE_URL,
  process.env.SERVICE_KEY
);

async function updateDatabase(results) {
  for (const result of results) {
    const { custom_id, response } = result;
    if (response.status_code === 200) {
      const rewrittenSpeeches = JSON.parse(response.body.choices[0].message.content);
      const { error } = await supabase
        .from('commons')
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

async function getBatchResults(batchId) {
  try {
    // Check the status of the batch
    const batch = await openai.batches.retrieve(batchId);
    console.log('Batch status:', batch.status);

    if (batch.status === 'cancelled' || batch.status === 'completed') {
      if (batch.output_file_id) {
        // Retrieve the results
        const fileResponse = await openai.files.content(batch.output_file_id);
        const fileContents = await fileResponse.text();

        // Save the results to a file
        const outputFileName = `batch_results_${batchId}.jsonl`;
        await fs.writeFile(outputFileName, fileContents);
        console.log(`Results saved to ${outputFileName}`);

        // Process and log some information about the results
        const results = fileContents.split('\n').filter(line => line.trim()).map(JSON.parse);
        console.log(`Number of results: ${results.length}`);
        
        // Upload the results to Supabase
        // await updateDatabase(results);
        console.log(results[0].response.body.choices[0].message.content);
      } else if (batch.error_file_id) {
        // Retrieve the error details
        const errorFileResponse = await openai.files.content(batch.error_file_id);
        const errorFileContents = await errorFileResponse.text();

        // Save the error details to a file
        const errorFileName = `batch_errors_${batchId}.jsonl`;
        await fs.writeFile(errorFileName, errorFileContents);
        console.log(`Error details saved to ${errorFileName}`);
      } else {
        console.log('Batch completed but no output file ID or error file ID found.');
      }
    } else if (batch.status === 'failed') {
      console.log('Batch did not complete successfully.');
      if (batch.error_file_id) {
        const errorFileResponse = await openai.files.content(batch.error_file_id);
        const errorFileContents = await errorFileResponse.text();
        console.log('Error details:', errorFileContents);
      }
    } else {
      console.log('Batch is still in progress or in an unexpected state.');
    }
  } catch (error) {
    console.error('Error retrieving batch results:', error);
  }
}

// Get the batch ID from command line arguments
const batchId = process.argv[2];

if (!batchId) {
  console.error('Please provide a batch ID as a command line argument');
  process.exit(1);
}

getBatchResults(batchId)
  .then(() => {
    console.log('Batch results retrieval completed.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });