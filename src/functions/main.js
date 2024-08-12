import { createClient } from '@supabase/supabase-js'
import { XMLParser } from 'fast-xml-parser'
import { Configuration, OpenAIApi } from 'openai'

export async function main(event, context) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }))
  
  const xmlData = await fetchXMLData()
  const parsedData = parseXMLData(xmlData)
  await storeDataInSupabase(supabase, parsedData)
  await generateAndStoreGPTResponses(supabase, openai, parsedData)
  
  return { statusCode: 200, body: 'Processing complete' }
}