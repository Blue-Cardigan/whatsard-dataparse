require('dotenv').config();
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');

const categoryOptions = [
  { id: 'commons', name: 'House of Commons' },
  { id: 'westminster', name: 'Westminster Hall' },
  { id: 'lords', name: 'House of Lords' },
  { id: 'publicbills', name: 'Public Bill Committee' },
];

function getPromptForCategory(category, type) {
  const categoryName = categoryOptions.find(option => option.id === category)?.name || 'Unknown';
  if (type === 'analysis') {
    return `
      ###INSTRUCTIONS###
      Analyze this current UK ${categoryName} debate and provide a concise and engaging 100 word analysis.
      Use British English spelling.
      Explain the core topic, the stances of the main contributors, and the takeaway.
      Ensure your response is very short, structured, and easy to understand.
      Structure your response as JSON:

      {"analysis": "text"}
      ######
      `;
  } else if (type === 'labels') {
    return `
    ###INSTRUCTIONS###
    Analyze this UK ${categoryName} debate then provide 3 categories and 10 tags to identify the core topics.
    Use British English spelling. 
    Structure your response as JSON:

    {
      "labels": {
          "categories": ["Category1", "Category2", "Category3"],
          "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5", "Tag6", "Tag7", "Tag8", "Tag9", "Tag10"],
      }
    }
    ######
      `;
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function fetchDebate(debateType, debateId) {
  const { data, error } = await supabase
    .from(debateType)
    .select('id, title, speeches')
    .eq('id', debateId)
    .single();

  if (error) throw error;
  return data;
}

async function generateMetadata(debate, type) {
  const { id, title, speeches } = debate;
  const debateType = id.split('_')[0];
  const content = `Title: ${title}\n\nSpeeches:\n${JSON.stringify(speeches, null, 2)}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4-0125-preview",
    messages: [
      { role: "system", content: getPromptForCategory(debateType, type) },
      { role: "user", content: content }
    ],
    response_format: { type: "json_object" }
  });

  return JSON.parse(completion.choices[0].message.content);
}

async function main() {
  const [debateType, debateId] = process.argv.slice(2);

  if (!debateType || !debateId) {
    console.error('Please provide both debate type and debate ID as arguments.');
    process.exit(1);
  }

  try {
    const debate = await fetchDebate(debateType, debateId);
    
    console.log('Generating analysis...');
    const analysis = await generateMetadata(debate, 'analysis');
    console.log('Analysis:', analysis);

    console.log('Generating tags...');
    const labels = await generateMetadata(debate, 'labels');
    console.log('Labels:', labels);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();