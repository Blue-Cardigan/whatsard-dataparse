import { prompts } from '../utils/prompts.ts';
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

interface Debate {
  message_id: string;
  title: string;
  speeches: { speech_text: string }[];
}

interface OpenAIClient {
  createCompletion: (params: {
    model: string;
    prompt: string;
    max_tokens: number;
  }) => Promise<{ data: { choices: { text: string }[] } }>;
}

export async function generateAndStoreGPTResponses(
  supabase: SupabaseClient,
  openai: OpenAIClient,
  { debates }: { debates: Debate[] }
): Promise<void> {
  for (const debate of debates) {
    const prompt = generatePromptForDebate(debate);
    const response = await openai.createCompletion({
      model: 'gpt-4',
      prompt: prompt,
      max_tokens: 500
    });
    
    await supabase.from('gpt_responses').insert({
      debate_id: debate.id,
      response: response.data.choices[0].text
    });
  }
}

export function generatePromptForDebate(debate: Debate): string {
  return `${prompts.SYSTEM_SPLIT_ANALYSIS_AND_TAGS}\n\nDebate Title: ${debate.title}\n\nContent: ${debate.speeches.map(s => s.speech_text).join('\n')}`;
}