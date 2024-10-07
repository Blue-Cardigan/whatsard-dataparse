function getPromptForCategory(category, type, chunkIndex = 0) {
  const categoryOptions = [
    { id: 'commons', name: 'House of Commons' },
    { id: 'westminster', name: 'Westminster Hall' },
    { id: 'lords', name: 'House of Lords' },
    { id: 'publicbills', name: 'Public Bill Committee' },
  ];

  const categoryName = categoryOptions.find(option => option.id === category)?.name || 'Unknown';
  
  let debateOrDiscussion = category === 'publicbills' ? 'discussion' : 'debate';
  const chunkText = chunkIndex > 0 ? `the ${ordinalSuffix(chunkIndex + 1)} part of ` : '';

  if (type === 'rewrite') {
    return `
      ###INSTRUCTION###
      Rewrite these speeches from ${chunkText}a UK ${categoryName} ${debateOrDiscussion} as clear Whatsapp messages with British spelling. 
      - Stay true to the original speakers' names and intention.
      - Keep the messages to-the-point. Remove superfluous phrases. 
      - Use markdown to highlight key data and arguments using bold, italics, and bullet points.
      - Highlight key phrases in bold.
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
  } else if (type === 'analysis') {
    return `
      ###INSTRUCTIONS###
      Analyze ${chunkText}this current UK ${categoryName} ${debateOrDiscussion} in 100 words or less.
      Use British English spelling.
      Focus on both key characteristics and content, and the stances of the main contributors.
      Structure your response as JSON:

      {"analysis": "text"}
      ######
      `;
  } else if (type === 'labels') {
    return `
    ###INSTRUCTIONS###
    Analyze ${chunkText}this UK ${categoryName} ${debateOrDiscussion} then provide up to 5 topics and up to 10 tags to use as metadata.
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
      Identify subtopics within the selected topics. 
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
  } else {
    return '';
  }
}

function ordinalSuffix(i) {
  const j = i % 10, k = i % 100;
  if (j == 1 && k != 11) {
    return i + "st";
  }
  if (j == 2 && k != 12) {
    return i + "nd";
  }
  if (j == 3 && k != 13) {
    return i + "rd";
  }
  return i + "th";
}

module.exports = { getPromptForCategory };