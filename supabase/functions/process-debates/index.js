import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { cron } from "https://deno.land/x/deno_cron@v1.0.0/cron.ts";
import { subDays, format, addDays } from "https://jspm.dev/date-fns@2.22.1";

import { processAndStoreData } from './fetchandstore/main.js';
import { main as generateDebates } from './generate/main.js';

const validDebateTypes = ['commons', 'lords', 'westminster', 'publicbills'];

async function processLastWeek() {
  const endDate = new Date();
  const startDate = subDays(endDate, 7);

  for (const debateType of validDebateTypes) {
    let currentDate = startDate;
    while (currentDate <= endDate) {
      const formattedDate = format(currentDate, 'yyyy-MM-dd');
      for (const suffix of ['a', 'b', 'c', 'd']) {
        await processAndStoreData(formattedDate, suffix, debateType);
      }
      currentDate = addDays(currentDate, 1);
    }
  }

  await generateDebates({
    debateTypes: 'all',
    startDate: format(startDate, 'yyyy-MM-dd'),
    endDate: format(endDate, 'yyyy-MM-dd'),
    batchSize: 512
  });

  console.log("Weekly processing and generation completed.");
}

// Schedule the job to run daily at 6:25 PM
cron("25 18 * * *", () => {
  processLastWeek().catch(error => {
    console.error("Error in scheduled job:", error);
  });
});

serve(async (req) => {
  if (req.method === 'POST') {
    const { command } = await req.json();
    if (command === 'run_now') {
      processLastWeek().catch(error => {
        console.error("Error in manual run:", error);
      });
      return new Response(JSON.stringify({ message: "Processing started" }), {
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
processLastWeek().catch(error => {
  console.error("Error in initial run:", error);
});