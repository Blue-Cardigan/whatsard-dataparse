import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { cron } from "https://deno.land/x/deno_cron@v1.0.0/cron.ts";
import { subDays, format, addDays } from "https://jspm.dev/date-fns@2.22.1";

import { processDebateType } from './fetchandstore/main.js';
import { main as generateDebates } from './generate/main.js';

const validDebateTypes = ['commons', 'lords', 'westminster', 'publicbills'];

async function processDebates(batchSize = 512, debateTypes = validDebateTypes) {
  const endDate = new Date();
  const startDate = subDays(endDate, 7);

  // First, fetch and store new data
  for (const debateType of debateTypes) {
    await processDebateType(
      format(startDate, 'yyyy-MM-dd'),
      format(endDate, 'yyyy-MM-dd'),
      debateType
    );
  }

  // Then, generate debates
  await generateDebates({
    debateTypes: debateTypes.join(','),
    batchSize: batchSize,
  });

  console.log(`Processing completed for debate types: ${debateTypes.join(', ')}. Batch size: ${batchSize}`);
}

// Schedule the job to run daily at 6:25 PM
cron("25 18 * * *", () => {
  processDebates().catch(error => {
    console.error("Error in scheduled job:", error);
  });
});

serve(async (req) => {
  if (req.method === 'POST') {
    const { command, batchSize, debateTypes } = await req.json();
    if (command === 'run_now') {
      const typesToProcess = debateTypes && Array.isArray(debateTypes) && debateTypes.length > 0
        ? debateTypes.filter(type => validDebateTypes.includes(type))
        : validDebateTypes;
      
      processDebates(batchSize || 512, typesToProcess).catch(error => {
        console.error("Error in manual run:", error);
      });
      return new Response(JSON.stringify({ message: "Processing started", debateTypes: typesToProcess }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ message: "Invalid request" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
});

// Initial run when the function starts
processDebates().catch(error => {
  console.error("Error in initial run:", error);
});