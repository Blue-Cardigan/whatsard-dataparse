function extractSquareBrackets(speeches) {
  return speeches.map(speech => {
    const matches = speech.content.match(/\[.*?\]/g) || [];
    return matches.map(match => match.slice(1, -1).trim());
  }).flat();
}

function findProposingMinister(speeches) {
  for (let i = 0; i < speeches.length - 1; i++) {
    if (speeches[i].content.toLowerCase().includes("i call the minister")) {
      console.log(`Proposing minister: ${speeches[i + 1].speakername}`);
      return speeches[i + 1].speakername;
    }
  }
  return null;
}

function generateExtracts(debates) {
  return debates.map(debate => ({
    ...debate,
    extracts: extractSquareBrackets(debate.speeches),
    proposing_minister: findProposingMinister(debate.speeches)
  }));
}

module.exports = {
  generateExtracts
};