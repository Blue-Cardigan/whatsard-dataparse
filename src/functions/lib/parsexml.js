const { DOMParser } = require('xmldom');

function processXML(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  
  const debates = [];
  let currentDebate = null;
  let currentType = '';

  function createDebate(id, title, type) {
    return {
      id,
      title,
      type,
      speaker_ids: new Set(),
      speeches: []
    };
  }

  function addSpeech(debate, speakerId, content) {
    if (speakerId) debate.speaker_ids.add(speakerId);
    debate.speeches.push({ speaker_id: speakerId, content });
  }

  function processNode(node) {
    switch (node.nodeName) {
      case 'major-heading':
        if (currentDebate) {
          debates.push(currentDebate);
          currentDebate = null;
        }
        currentType = node.textContent.trim();
        break;

      case 'minor-heading':
        if (currentDebate) debates.push(currentDebate);
        const id = node.getAttribute('id').split('/').pop();
        const title = node.textContent.trim();
        currentDebate = createDebate(id, title, currentType);
        break;

      case 'speech':
        if (!currentDebate) {
          currentDebate = createDebate(null, currentType, currentType);
        }
        const speakerId = node.getAttribute('person_id');
        const content = Array.from(node.getElementsByTagName('p'))
          .map(p => p.textContent.trim())
          .join('\n');
        addSpeech(currentDebate, speakerId, content);
        break;
    }

    // Modified this part to use Array.from()
    if (node.childNodes) {
      Array.from(node.childNodes).forEach(processNode);
    }
  }

  processNode(xmlDoc.documentElement);
  if (currentDebate) debates.push(currentDebate);

  return debates.map(debate => ({
    ...debate,
    speaker_ids: Array.from(debate.speaker_ids)
  }));
}

// Usage
const xmlSnippet = `
<publicwhip scraperversion="a" latest="yes">
<major-heading id="uk.org.publicwhip/debate/2024-07-30a.1149.0" nospeaker="true" colnum="1149" time="" url=""> Speaker's Statement </major-heading>
<speech id="uk.org.publicwhip/debate/2024-07-30a.1149.1" speakername="Lindsay Hoyle" person_id="uk.org.publicwhip/person/10295" colnum="1149" time="" url="">
<p pid="a1149.1/1">Before we begin today's proceedings, I would like to pay tribute to John Tamlyn, the Bar Doorkeeper who retires today after an incredible 36 years. John is a much-loved member of the Doorkeeper team, whose career in the House of Commons began in 1988, first as an attendant to the Sergeant at Arms office and then as Doorkeeper for the last 26 years. In that time, John has led the Speaker's procession into the Chamber hundreds of times. He is hugely respected and has developed a reputation as a font of all knowledge on Chamber procedures and a reliable source of information for Members—some might say too much at times, John.</p>
<p pid="a1149.1/2">To the team and those who work with him, John is known for being one of the smartest dressed Doorkeepers who has a fantastic sense of humour. He is an expert on music—especially '70s disco and '80s pop, which he does enjoy—and I am told that he is a mean dancer. He is also a keen photographer. I am sure that the whole House will join me in thanking John for his loyal, lengthy service. I wish him a very happy retirement. Thank you, John, for everything.</p>
</speech>
<speech id="uk.org.publicwhip/debate/2024-07-30a.1149.2" speakername="Hon. Members:" nospeaker="true" colnum="1149" time="" url="">
<p pid="a1149.2/1">Hear, hear!</p>
</speech>
<major-heading id="uk.org.publicwhip/debate/2024-07-30a.1149.3" nospeaker="true" colnum="1149" time="" url=""> Business before Questions </major-heading>
<minor-heading id="uk.org.publicwhip/debate/2024-07-30a.1149.4" nospeaker="true" colnum="1149" time="" url=""> Committee of Selection </minor-heading>
<speech id="uk.org.publicwhip/debate/2024-07-30a.1149.5" nospeaker="true" colnum="1149" time="" url="">
<p pid="a1149.5/1" class="italic">Ordered,</p>
<p pid="a1149.5/2" class="indent" pwmotiontext="yes">That Stuart Anderson, Wendy Chamberlain, Samantha Dixon, Chris Elmore, Vicky Foxcroft, Rebecca Harris, Jessica Morden, Jeff Smith and Mark Tami be members of the Committee of Selection until the end of the current Parliament.—(Mark Tami.)</p>
</speech>
</publicwhip>
`;

const result = processXML(xmlSnippet);
console.log(JSON.stringify(result, null, 2));