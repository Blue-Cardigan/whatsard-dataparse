import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

interface Speaker {
  name: string;
  title: string;
  party: string;
  url: string;
  image_url: string;
}

interface Debate {
  id: string;
  title: string;
  type: string;
  speaker_ids: string[];
  speeches: { speakername: string; speech_text: string }[];
}

let supabase: SupabaseClient | null = null;

async function initSupabase(supabaseUrl: string, supabaseKey: string): Promise<void> {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User must be authenticated to store data');
  }
}

export async function storeDataInSupabase(
  { debates, speakers }: { debates: Debate[]; speakers: Map<string, Speaker> }
): Promise<void> {
  await initSupabase(supabaseUrl, supabaseKey);

  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  // Store speakers in batches
  const speakerChunks = Array.from({ length: Math.ceil(speakers.size / 100) }, (_, i) =>
    Array.from(speakers).slice(i * 100, (i + 1) * 100)
  );
  for (const chunk of speakerChunks) {
    const { error } = await supabase.from('speakers').upsert(chunk.map(([id, speaker]) => ({
      id,
      name: speaker.name,
      title: speaker.title || '',
      party: speaker.party || '',
      url: speaker.url || '',
      image_url: speaker.image_url || ''
    })));
    if (error) throw error;
  }
  
  // Store debates in batches
  const debateChunks = Array.from({ length: Math.ceil(debates.length / 100) }, (_, i) =>
    debates.slice(i * 100, (i + 1) * 100)
  );
  for (const chunk of debateChunks) {
    const { error } = await supabase.from('commons').upsert(chunk.map(debate => ({
      id: debate.id,
      title: debate.title,
      type: debate.type,
      speaker_ids: debate.speaker_ids,
      speeches: debate.speeches
    })));
    if (error) throw error;
  }
}