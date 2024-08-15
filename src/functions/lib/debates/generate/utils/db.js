const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fetchUnprocessedDebates(debateType, batchSize, startDate, endDate) {
    let query = supabase
      .from(debateType)
      .select('id, title, speeches')
      .is('rewritten_speeches', null)
      .is('analysis', null)
      .is('labels', null)
      .order('id', { ascending: true })
      .limit(batchSize);
  
    if (startDate) {
      query = query.gte('id', `${debateType}_${startDate}`);
    }
    if (endDate) {
      query = query.lte('id', `${debateType}_${endDate}`);
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

async function updateDebate(debateType, debateId, updateData) {
  const { error } = await supabase
    .from(debateType)
    .update(updateData)
    .eq('id', debateId);

  if (error) throw error;
}

module.exports = { fetchUnprocessedDebates, updateDebate };