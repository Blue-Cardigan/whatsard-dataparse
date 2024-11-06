// Run with eg
// node src/local/generate.cjs startDate=2024-09-02 debateType=commons

// Test a single debate
// node src/local/generate.cjs test=commons2024-10-22a.171.5 debateType=commons

const { processSingleDebateType } = require('./generate/supportingInfo.cjs');
const { 
  batchProcessDebates, 
  supabase, 
  prepareBatchFile, 
  uploadBatchFile, 
  createBatch, 
  checkBatchStatus, 
  retrieveResults,
  fetchErrorFile
} = require('./generate/batchProcessor.cjs');
const { getPromptForCategory } = require('./generate/getPrompt.cjs');
const fs = require('fs').promises;
const { runChatProcessing } = require('./generate/chatRunner.cjs');

async function testSingleDebate(debateId, debateType, generateType = null) {
  // Fetch the debate
  const { data: debate, error } = await supabase
    .from(debateType)
    .select('*')
    .eq('id', debateId)
    .single();

  if (error) {
    console.error('Error fetching debate:', error);
    return;
  }

  if (!debate) {
    console.error('Debate not found');
    return;
  }

  console.log('Testing debate:', debate.title);

  // Define all possible processes
  const allProcesses = [
    { type: 'analysis', label: 'Analysis Output' },
    { type: 'labels', label: 'Labels Output' },
    { type: 'rewrite', label: 'Rewrite Output' }
  ];

  // Filter processes based on generateType parameter
  const processes = generateType ? 
    allProcesses.filter(p => p.type === generateType) : 
    allProcesses;

  if (processes.length === 0) {
    console.error(`Invalid generate type: ${generateType}. Valid types are: analysis, labels, rewrite`);
    return;
  }

  for (const process of processes) {
    let fileName;
    try {
      console.log(`\n=== Testing ${process.label} ===`);
      
      // Prepare batch file
      console.log('Preparing batch file...');
      fileName = await prepareBatchFile([debate], debateType, getPromptForCategory, process.type === 'rewrite');
      
      // Upload file
      console.log('Uploading file to OpenAI...');
      const fileId = await uploadBatchFile(fileName);
      console.log(`File uploaded successfully with ID: ${fileId}`);
      
      // Create batch
      console.log('Creating batch...');
      const batchId = await createBatch(fileId);
      console.log(`Batch created with ID: ${batchId}`);
      
      // Check batch status
      console.log('Checking batch status...');
      const completedBatch = await checkBatchStatus(batchId);
      
      if (completedBatch.status === 'completed') {
        if (completedBatch.output_file_id) {
          const results = await retrieveResults(completedBatch.output_file_id);
          console.log(JSON.stringify(results, null, 2));
        } else if (completedBatch.error_file_id) {
          console.error('Batch completed with errors. Fetching error file...');
          await fetchErrorFile(completedBatch.error_file_id);
        }
      } else {
        console.error(`${process.label} failed:`, completedBatch.status);
      }

    } catch (error) {
      console.error(`Error processing ${process.label}:`, {
        message: error.message,
        stack: error.stack,
        response: error.response?.data || error.response,
      });
    } finally {
      // Clean up the temporary file if it exists
      if (fileName) {
        try {
          await fs.unlink(fileName);
          console.log(`Cleaned up temporary file: ${fileName}`);
        } catch (cleanupError) {
          console.warn(`Warning: Could not clean up file ${fileName}:`, cleanupError.message);
        }
      }
    }
  }
}

async function runBothProcesses() {
  const args = process.argv.slice(2);
  const params = Object.fromEntries(args.map(arg => arg.split('=')));

  // Check if we should use chat processor instead of batch
  const useChat = params.processor === 'chat';
  
  // Check if we're in test mode
  if (params.test) {
    if (!params.debateType) {
      console.error('debateType parameter is required for test mode');
      process.exit(1);
    }
    await testSingleDebate(params.test, params.debateType, params.generate);
    return;
  }

  // Regular processing mode
  const debateType = params.debateType ? 
    (params.debateType === 'all' ? ['commons', 'lords', 'westminster', 'publicbills'] : params.debateType.split(','))
    : ['commons', 'lords', 'westminster', 'publicbills'];
  const batchSize = parseInt(params.batchSize) || 32;
  const startDate = params.startDate || null;
  const endDate = params.endDate || null;

  if (useChat) {
    console.log('current OPENAI_API_KEY', process.env.OPENAI_API_KEY);
    // Use chat processor
    console.log('Using chat processor...');
    if (!params.generate) {
      // Run both processes when no specific generate type is specified
      console.log('Running analysis and labels...');
      await runChatProcessing(batchSize, debateType, startDate, endDate, false);
      console.log('Running rewrite...');
      await runChatProcessing(batchSize, debateType, startDate, endDate, true);
    } else {
      // Run specific process type
      await runChatProcessing(batchSize, debateType, startDate, endDate, params.generate === 'rewrite');
    }
  } else {
    // Use batch processor (existing code)
    if (!params.generate || params.generate === 'analysis' || params.generate === 'labels') {
      console.log('Starting supportingInfo process (analysis and labels)...');
      for (const type of debateType) {
        await processSingleDebateType(type, batchSize, startDate, endDate, getPromptForCategory);
      }
    }

    if (!params.generate || params.generate === 'rewrite') {
      console.log('Starting mainChat process (rewrite)...');
      await batchProcessDebates(batchSize, debateType, startDate, getPromptForCategory);
    }
  }

  console.log('All processes completed.');
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
