import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import csv from 'csv-parser'
import dotenv from 'dotenv';

dotenv.config();
// Supabase configuration
const supabaseUrl = process.env.DATABASE_URL
const supabaseKey = process.env.SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Path to your mps.csv file
const csvFilePath = 'src/functions/speakers/futz/mps.csv'

// Function to read Person IDs from CSV
function readPersonIdsFromCsv() {
  return new Promise((resolve, reject) => {
    const personIds = new Set()
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        if (row['Person ID']) {
          personIds.add(row['Person ID'])
        }
      })
      .on('end', () => {
        console.log(`Read ${personIds.size} Person IDs from CSV`)
        resolve(personIds)
      })
      .on('error', reject)
  })
}

// Function to update isCurrent in Supabase
async function updateIsCurrentInSupabase(personIds) {
  const batchSize = 1000; // Adjust this based on your database limits
  const personIdArray = Array.from(personIds);

  for (let i = 0; i < personIdArray.length; i += batchSize) {
    const batch = personIdArray.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('speakers')
      .update({ isCurrent: true })
      .filter('id', 'in', `(${batch.join(',')})`)

    if (error) {
      console.error(`Error updating speakers (batch ${i/batchSize + 1}):`, error)
    } else {
      console.log(`Updated speakers in batch ${i/batchSize + 1}`)
    }
  }

  console.log('Finished updating speakers')
}

// Main function
async function main() {
  try {
    const personIds = await readPersonIdsFromCsv()
    await updateIsCurrentInSupabase(personIds)
  } catch (error) {
    console.error('An error occurred:', error)
  }
}

// Run the script
main()