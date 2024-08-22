const categoryOptions = [
    { id: 'commons', name: 'House of Commons' },
    { id: 'westminster', name: 'Westminster Hall' },
    { id: 'lords', name: 'House of Lords' },
    { id: 'publicbills', name: 'Public Bill Committee' },
  ];
  
  export function getPromptForCategory(category, type) {
    const categoryName = categoryOptions.find(option => option.id === category)?.name || 'Unknown';
    
    switch (type) {
      case 'speeches':
        return `
          ###INSTRUCTION###
          Rewrite these speeches from a UK ${categoryName} debate in the style of Whatsapp messages. 
          Keep close to the original meaning to avoid defamation.
          Clarify meaning which has been obfuscated by the original style. 
          Focus on data and key arguments.
          Use British English spelling with some emojis, and markdown formatting for long messages.
          
          Provide your response as JSON with keys for "speakername", and "rewritten_speech". 
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
        `;
      case 'analysis':
        return `
          ###INSTRUCTIONS###
          Analyze this current UK ${categoryName} debate and provide a concise and engaging 100 word analysis.
          Use British English spelling and narrative present tense.
          Explain the core topic, the stances of the main contributors, and the takeaway.
          Ensure your response is very short, structured, and easy to understand.
          Structure your response as JSON:
    
          {"analysis": "text"}
          ######
        `;
      case 'labels':
        return `
          ###INSTRUCTIONS###
          Analyze this UK ${categoryName} debate then provide 3 categories and 10 tags to identify the core topics.
          Use British English spelling. 

          #Select Categories From this List Only#
            Environment and Natural Resources
            Healthcare and Social Welfare
            Economy, Business, and Infrastructure
            Science, Technology, and Innovation
            Legal Affairs and Public Safety
            International Relations and Diplomacy
            Parliamentary Affairs and Governance
            Education, Culture, and Society
          #
          
          #Tags
            Should focus on subtopics of the categories and debate points. 
            Avoid overlapping tags such as "recall petition" and "petition officer"
            Avoid broad tags like "Parliamentary debate" or "Official Report".
          #

          Structure your response as JSON:
    
          {
            "labels": {
              "categories": ["Category1", "Category2", "Category3"],
              "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5", "Tag6", "Tag7", "Tag8", "Tag9", "Tag10"]
            }
          }
          ######
        `;
      default:
        throw new Error(`Invalid prompt type: ${type}`);
    }
  }
  
  export default {
    getPromptForCategory,
  };