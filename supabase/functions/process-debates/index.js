import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { validDebateTypes } from './config.js'
import { processSingleDebateType } from './batchProcessor.js'

serve(async (req) => {
  const { debateTypes, startDate, endDate, batchSize } = await req.json()

  const types = debateTypes === 'all' ? validDebateTypes : debateTypes.split(',')
  const size = parseInt(batchSize) || 128

  for (const debateType of types) {
    console.log(`Processing ${debateType} from ${startDate || 'earliest'} to ${endDate || 'latest'}`)
    await processSingleDebateType(debateType, size, startDate, endDate)
  }

  return new Response(
    JSON.stringify({ message: "Processing completed" }),
    { headers: { "Content-Type": "application/json" } },
  )
})