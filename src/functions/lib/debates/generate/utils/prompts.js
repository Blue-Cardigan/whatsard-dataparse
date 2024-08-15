const categoryOptions = [
  { id: 'commons', name: 'House of Commons' },
  { id: 'westminster', name: 'Westminster Hall' },
  { id: 'lords', name: 'House of Lords' },
  { id: 'publicbills', name: 'Public Bill Committee' },
];

function getPromptForCategory(category, type) {
  const categoryName = categoryOptions.find(option => option.id === category)?.name || 'Unknown';
  
  const prompts = {
    main: `
      ###INSTRUCTION###
      Rewrite these speeches from a UK ${categoryName} debate in the style of Whatsapp messages. Provide your response as JSON with keys for "speakername", and "rewritten_speech". 
      Clarify meaning which has been obfuscated by the original style. 
      Focus on data and key arguments.
      Use British English spelling with some emojis, and markdown formatting for long messages.

      Reduce the number of messages if necessary, but ensure all speakers are represented and all data and arguments are preserved. 
      
      Structure your response like this:
      {
        "speeches": [
          {
          "speakername": "text",
          "rewritten_speech": "text"
          },
          ...
        ]
      }
      ######
    `,
    analysis: `
      ###INSTRUCTIONS###
      Analyze this current UK ${categoryName} debate and provide a concise and engaging 100 word analysis.
      Use British English spelling.
      Explain the core topic, the stances of the main contributors, and the takeaway.
      Ensure your response is very short, structured, and easy to understand.
      Structure your response as JSON:

      {"analysis": "text"}
      ######
    `,
    labels: `
      ###INSTRUCTIONS###
      Analyze this UK ${categoryName} debate then provide 3 categories and 10 tags to identify the core topics.
      Use British English spelling. 
      Structure your response as JSON:

      {
        "labels": {
          "categories": ["Category1", "Category2", "Category3"],
          "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5", "Tag6", "Tag7", "Tag8", "Tag9", "Tag10"]
        }
      }
      ######
    `
  };

  return prompts[type];
}

module.exports = { getPromptForCategory };