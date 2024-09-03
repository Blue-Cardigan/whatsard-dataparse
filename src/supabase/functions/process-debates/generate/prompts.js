const categoryOptions = [
    { id: 'commons', name: 'House of Commons' },
    { id: 'westminster', name: 'Westminster Hall' },
    { id: 'lords', name: 'House of Lords' },
    { id: 'publicbills', name: 'Public Bill Committee' },
  ];
  
  export function getPromptForCategory(category, type) {
    const categoryName = categoryOptions.find(option => option.id === category)?.name || 'Unknown';
    const isPublicBill = category === 'publicbills';
    const debateOrDiscussion = isPublicBill ? 'discussion' : 'debate';
    
    switch (type) {
      case 'speeches':
        return `
          ###INSTRUCTION###
          Rewrite these speeches from a UK ${categoryName} ${debateOrDiscussion} in the style of Whatsapp messages. 
          - Stay true to the original speaker's name and intention.
          - Keep the messages to-the-point. Remove superfluous phrases including "Thank you" or "I agree".
          - Use British English spelling.
          - Use markdown to highlight key data and arguments using bold, italics, and bullet points.
          - Use a serious tone for serious topics, such as violence or extreme poverty.
          - Use a light tone with one or two emojis if the topic is a light topic.
          
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
          Analyze this current UK ${categoryName} ${debateOrDiscussion} and provide a concise and engaging 100 word analysis.
          Use British English spelling and narrative present tense.
          Explain the core topic, the stances of the main contributors, and the takeaway.
          Ensure your response is very short, structured, and easy to understand.
          Structure your response as JSON:
    
          {"analysis": "This ${debateOrDiscussion}..."}
          ######
        `;
      case 'labels':
        return `
          ###INSTRUCTIONS###
          Analyze this UK ${categoryName} ${debateOrDiscussion} then provide up to 5 topics and up to 10 tags to use as metadata.
          Use British English spelling. 

          #Select Topics From this List Only#
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
            Identify subtopics of the selected topics. 
            Avoid overlapping tags such as "recall petition" and "petition officer"
            Avoid broad tags like "Parliamentary debate" or "Official Report".
          #

          Structure your response as JSON:
    
          {
            "labels": {
              "topics": ["Topic1", "Topic2", "More topics if needed"],
              "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5", "More tags if needed"]
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