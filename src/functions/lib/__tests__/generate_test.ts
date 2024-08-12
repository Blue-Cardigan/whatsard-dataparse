import { assertEquals, assertSpyCalls, spy } from "std/testing/asserts.ts";
import { generateAndStoreGPTResponses, generatePromptForDebate } from "@/functions/lib/generate.ts";

Deno.test("generateAndStoreGPTResponses generates and stores GPT responses", async () => {
  const mockSupabase = {
    from: () => ({
      insert: spy(() => Promise.resolve(true))
    })
  };

  const mockOpenAI = {
    createCompletion: spy(() => Promise.resolve({
      data: { choices: [{ text: 'Mock GPT response' }] }
    }))
  };

  const mockDebates = [{
    id: '1',
    title: 'Mock Debate',
    speeches: [{ speech_text: 'This is a mock speech.' }]
  }];

  await generateAndStoreGPTResponses(mockSupabase as any, mockOpenAI as any, { debates: mockDebates });

  assertSpyCalls(mockOpenAI.createCompletion, 1);
  assertSpyCalls(mockSupabase.from().insert, 1);
});

Deno.test("generatePromptForDebate generates correct prompt for debate", () => {
  const mockDebate = {
    message_id: '1',
    title: 'Mock Debate',
    speeches: [{ speech_text: 'This is a mock speech.' }]
  };

  const prompt = generatePromptForDebate(mockDebate);
  
  assertEquals(prompt.includes('Mock Debate'), true);
  assertEquals(prompt.includes('This is a mock speech.'), true);
});