import OpenAI from "https://deno.land/x/openai@v4.56.0/mod.ts";
import { OPENAI_API_KEY } from './config.js';
import { join } from "https://deno.land/std@0.177.0/path/mod.ts";

const openai = new OpenAI(OPENAI_API_KEY);

export async function uploadBatchFile(fileName) {
    const filePath = join(Deno.cwd(), fileName);
    const fileInfo = await Deno.stat(filePath);
    console.log(`Uploading file with size: ${fileInfo.size} bytes`);

    const file = await Deno.readFile(filePath);
    
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
        try {
            const uploadedFile = await openai.files.create({
                file: new File([file], fileName),
                purpose: 'batch'
            });
            console.log('File uploaded:', uploadedFile);
            return uploadedFile.id;
        } catch (error) {
            console.error(`Upload attempt ${retries + 1} failed:`, error.message);
            retries++;
            if (retries < maxRetries) {
                const delay = Math.pow(2, retries) * 1000; // Exponential backoff
                console.log(`Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}

export async function createBatch(fileId) {
    const batch = await openai.batches.create({
        input_file_id: fileId,
        endpoint: "/v1/chat/completions",
        completion_window: "24h"
    });
    console.log('Batch created:', batch);
    return batch.id;
}

export async function checkBatchStatus(batchId) {
    let batch;
    do {
        batch = await openai.batches.retrieve(batchId);
        console.log('Batch status:', batch.status);
        if (batch.status !== 'completed') {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for 10 seconds
        }
    } while (batch.status !== 'completed' && batch.status !== 'failed' && batch.status !== 'expired');
    return batch;
}

export async function retrieveResults(fileId) {
    const fileResponse = await openai.files.content(fileId);
    const fileContents = await fileResponse.text();
    console.log('Raw file contents:', fileContents); // Log raw contents for debugging

    if (!fileContents.trim()) {
        console.error('Retrieved file is empty');
        return [];
    }

    const lines = fileContents.split('\n').filter(line => line.trim());
    console.log(`Number of result lines: ${lines.length}`);

    return lines.map((line, index) => {
        try {
            return JSON.parse(line);
        } catch (error) {
            console.error(`Error parsing JSON on line ${index + 1}:`, error);
            console.error('Problematic line:', line);
            return null;
        }
    }).filter(result => result !== null);
}

export default {
    openai,
    uploadBatchFile,
    createBatch,
    checkBatchStatus,
    retrieveResults,
};