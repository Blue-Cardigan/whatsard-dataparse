import { assertEquals, assertNotEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { parseXML } from "../parsexml.ts";

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


Deno.test("parseXML function", async () => {
  const result = parseXML(xmlSnippet);
  console.log("Result:", JSON.stringify(result, null, 2));

  // Test 1: Check if debates are created correctly
  assertEquals(result.length, 1, "Should have 1 debate");

  // Test 2: Check if major-heading is used as debate title and type
  assertEquals(result[0].title, "Speaker's Statement", "First debate title should be 'Speaker's Statement'");
  assertEquals(result[0].type, "Speaker's Statement", "First debate type should be 'Speaker's Statement'");

  // Test 3: Check if minor-heading creates a new debate
  assertEquals(result[1].title, "Committee of Selection", "Second debate title should be 'Committee of Selection'");
  assertEquals(result[1].type, "Business before Questions", "Second debate type should be 'Business before Questions'");

  // Test 4: Check if debate IDs are correctly extracted
  assertEquals(result[0].id, "2024-07-30a.1149.0", "First debate ID should be '2024-07-30a.1149.0'");
  // assertEquals(result[1].id, "2024-07-30a.1149.4", "Second debate ID should be '2024-07-30a.1149.4'");

  // Test 5: Check if speaker_ids are correctly extracted and stored
  assertEquals(result[0].speaker_ids, ["10295"], "First debate should have one speaker with ID '10295'");

  // Test 6: Check if speeches are correctly stored
  assertEquals(result[0].speeches.length, 2, "First debate should have 2 speeches");
  assertEquals(result[0].speeches[0].speakername, "Lindsay Hoyle", "First speech should be by Lindsay Hoyle");
  assertEquals(result[0].speeches[1].speakername, "Hon. Members:", "Second speech should be by Hon. Members:");

  // Test 7: Check if speech text is correctly concatenated
  assertTrue(result[0].speeches[0].speech_text.includes("Before we begin today's proceedings"), "First speech should start with 'Before we begin today's proceedings'");
  assertTrue(result[0].speeches[0].speech_text.includes("Thank you, John, for everything."), "First speech should end with 'Thank you, John, for everything.'");

});

// Helper function to check if a string includes another string
function assertTrue(condition: boolean, message: string) {
  assertEquals(condition, true, message);
}

// // Fetch and parse the actual XML data
// const url = "https://www.theyworkforyou.com/pwdata/scrapedxml/debates/debates2024-07-30a.xml";
// const response = await fetch(url);
// const xmlData = await response.text();
// const actualResult = parseXML(xmlData);

// Deno.test("Actual XML data parsing", () => {
//   assertNotEquals(actualResult.debates.length, 0, "Should have parsed some debates");
//   assertNotEquals(actualResult.speakers.size, 0, "Should have parsed some speakers");
// });