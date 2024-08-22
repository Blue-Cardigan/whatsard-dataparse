const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = require('./config');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function fetchUnprocessedDebates(batchSize, debateType, startDate, endDate) {
    const query = supabase
      .from(debateType)
      .select('id, title, speeches, rewritten_speeches, analysis, labels, speaker_names')
      .or('rewritten_speeches.is.null,analysis.is.null,labels.is.null')
      .filter('speeches', 'not.eq', '[]')
      .filter('speeches', 'not.eq', null)
      .order('id', { ascending: true })
      .limit(batchSize);
  
    if (startDate) {
      query.gte('id', `${debateType}_${startDate}`);
    }
    if (endDate) {
      query.lte('id', `${debateType}_${endDate}`);
    }
  
    const { data, error } = await query;
  
    if (error) throw error;
  
    const filteredData = data.filter(debate => {
      const speechesJson = JSON.stringify(debate.speeches);
      return speechesJson.length < 100000;
    });
  
    console.log(`Fetched ${data.length} debates for ${debateType}, ${filteredData.length} within size limit`);
  
    return filteredData;
  }

async function updateDatabase(results, debateType) {
  const validDebateTypes = ['commons', 'lords', 'westminster', 'publicbills'];
  
  for (const result of results) {
    const { custom_id, response } = result;
    if (response.status_code === 200) {
      const [id, type] = custom_id.split('_');
      const content = JSON.parse(response.body.choices[0].message.content);

      if (!validDebateTypes.includes(debateType)) {
        console.error(`Invalid debate type: ${debateType} for ID ${id}`);
        continue;
      }

      let updateData = {};
      if (type === 'speeches') {
        updateData.rewritten_speeches = content.speeches;
        
        // Fetch the original speeches to compare lengths
        const { data: originalDebate, error: fetchError } = await supabase
          .from(debateType)
          .select('speeches')
          .eq('id', id)
          .single();

        if (fetchError) {
          console.error(`Error fetching original speeches for ID ${id} in ${debateType}:`, fetchError);
          continue;
        }

        const originalSpeechesLength = Array.isArray(originalDebate.speeches) ? originalDebate.speeches.length : 0;
        const rewrittenSpeechesLength = Array.isArray(content.speeches) ? content.speeches.length : 0;

        updateData.speechesparallel = originalSpeechesLength === rewrittenSpeechesLength && originalSpeechesLength > 0;
      } else if (type === 'analysis') {
        // Fetch the debate to check speaker names
        const { data: debate, error: fetchError } = await supabase
          .from(debateType)
          .select('speaker_names')
          .eq('id', id)
          .single();

        if (fetchError) {
          console.error(`Error fetching debate for ID ${id} in ${debateType}:`, fetchError);
          continue;
        }

        const hasOtherSpeakers = debate.speaker_names && 
                                 Array.isArray(debate.speaker_names) && 
                                 debate.speaker_names.some(name => name !== "Lindsay Hoyle");

        if (hasOtherSpeakers) {
          updateData.analysis = content.analysis;
        } else {
          console.log(`Skipping analysis for debate ID ${id} in ${debateType} as it only has Lindsay Hoyle as speaker`);
          continue;
        }
      } else if (type === 'labels') {
        updateData.labels = content.labels;
      }

      console.log(`Updating ${debateType} table for ID ${id} with ${type}`);

      const { error } = await supabase
        .from(debateType)
        .update(updateData)
        .eq('id', id);
      
      if (error) {
        console.error(`Error updating database for ID ${id} in ${debateType}:`, error);
      } else {
        console.log(`Updated ${type} for debate ID ${id} in ${debateType}`);
        if (type === 'speeches') {
          console.log(`Set speechesparallel to ${updateData.speechesparallel} for debate ID ${id} in ${debateType}`);
        }
      }
    } else {
      console.error(`Error processing ID ${custom_id}:`, response.error);
    }
  }
}

module.exports = {
  supabase,
  fetchUnprocessedDebates,
  updateDatabase,
};