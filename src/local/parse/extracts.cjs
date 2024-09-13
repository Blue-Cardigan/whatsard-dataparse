function extractSquareBrackets(speeches) {
  return speeches.map(speech => {
    const matches = speech.content.match(/\[.*?\]/g) || [];
    if (matches.length > 0) {
      console.log(`matches: ${matches}`);
    }
    return matches.map(match => match.slice(1, -1).trim());
  }).flat();
}

function findProposingMinister(speeches) {
  for (let i = 0; i < speeches.length - 1; i++) {
    if (speeches[i].content.toLowerCase().includes("i call the minister")) {
      console.log(`minister: ${speeches[i + 1].speakername}`);
      return speeches[i + 1].speakername;
    }
  }
  return null;
}

function generateExtracts(debates) {
  console.log(`generating extracts for ${debates.length} debates`);
  return debates.map(debate => ({
    ...debate,
    extracts: extractSquareBrackets(debate.speeches),
    proposing_minister: findProposingMinister(debate.speeches)
  }));
}

module.exports = {
  generateExtracts
};