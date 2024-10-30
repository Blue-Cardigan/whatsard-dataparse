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
    console.log('Batch details:', JSON.stringify(batch, null, 2));

    if (batch.status === 'cancelled' || batch.status === 'completed') {
      if (batch.failed_count > 0) {
        console.log(`Failed runs: ${batch.failed_count}`);
        // Retrieve and display error details
        const errorFileResponse = await openai.files.content(batch.error_file_id);
        const errorFileContents = await errorFileResponse.text();
        const errors = errorFileContents.split('\n')
          .filter(line => line.trim())
          .map(JSON.parse);
        
        errors.forEach(error => {
          console.error(`Error for ID ${error.custom_id}:`, error.error);
        });
      }

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
      console.error('Batch failed');
      console.error('Batch details:', JSON.stringify(batch, null, 2));
      
      if (batch.error_file_id) {
        try {
          const errorFileResponse = await openai.files.content(batch.error_file_id);
          const errorFileContents = await errorFileResponse.text();
          console.error('Error file contents:', errorFileContents);
          
          // Try to parse errors if they're in JSON format
          try {
            const errors = errorFileContents.split('\n')
              .filter(line => line.trim())
              .map(JSON.parse);
            
            console.error('Detailed errors:');
            errors.forEach(error => {
              console.error(`- ${JSON.stringify(error)}`);
            });
          } catch (parseError) {
            // If parsing fails, just output the raw error content
            console.error('Raw error content:', errorFileContents);
          }
        } catch (fileError) {
          console.error('Error retrieving error file:', fileError);
        }
      } else {
        console.error('No error file ID available');
        console.error('Failed batch metadata:', {
          id: batch.id,
          created_at: batch.created_at,
          status: batch.status,
          failed_count: batch.failed_count,
          succeeded_count: batch.succeeded_count,
          total_count: batch.total_count
        });
      }
    } else {
      console.log('Batch progress details:', {
        id: batch.id,
        status: batch.status,
        created_at: batch.created_at,
        completed_at: batch.completed_at,
        total_count: batch.total_count,
        succeeded_count: batch.succeeded_count,
        failed_count: batch.failed_count,
        pending_count: batch.pending_count
      });
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