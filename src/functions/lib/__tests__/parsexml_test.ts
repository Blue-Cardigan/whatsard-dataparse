import { assertEquals, assertNotEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { processXML } from "../debates/parsecommons.js";

const xmlSnippet = `
<publicwhip scraperversion="a" latest="yes">
<major-heading id="uk.org.publicwhip/debate/2024-07-30a.1149.0" nospeaker="true" colnum="1149" time="" url=""> Speaker's Statement </major-heading>
<speech id="uk.org.publicwhip/debate/2024-07-30a.1149.1" speakername="Lindsay Hoyle" person_id="uk.org.publicwhip/person/10295" colnum="1149" time="" url="">
<p pid="a1149.1/1">Before we begin today's proceedings, I would like to pay tribute to John Tamlyn, the Bar Doorkeeper who retires today after an incredible 36 years.</p>
<p pid="a1149.1/2">To the team and those who work with him, John is known for being one of the smartest dressed Doorkeepers who has a fantastic sense of humour.</p>
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

Deno.test("processXML function", () => {
  const result = processXML(xmlSnippet);
  console.log("Result:", JSON.stringify(result, null, 2));

  // Test 1: Check if debates are created correctly
  assertEquals(result.length, 2, "Should have 2 debates");

  // Test 2: Check if major-heading is used as debate title and type
  assertEquals(result[0].title, "Speaker's Statement", "First debate title should be 'Speaker's Statement'");
  assertEquals(result[0].type, "Speaker's Statement", "First debate type should be 'Speaker's Statement'");

  // Test 3: Check if minor-heading creates a new debate
  assertEquals(result[1].title, "Committee of Selection", "Second debate title should be 'Committee of Selection'");
  assertEquals(result[1].type, "Business before Questions", "Second debate type should be 'Business before Questions'");

  // Test 4: Check if debate IDs are correctly extracted
  assertEquals(result[0].id, "2024-07-30a.1149.0", "First debate ID should be '2024-07-30a.1149.0'");
  assertEquals(result[1].id, "2024-07-30a.1149.4", "Second debate ID should be '2024-07-30a.1149.4'");

  // Test 5: Check if speaker_ids are correctly extracted and stored
  assertEquals(result[0].speaker_ids, ["10295"], "First debate should have one speaker with ID '10295'");

  // Test 6: Check if speeches are correctly stored
  assertEquals(result[0].speeches.length, 2, "First debate should have 2 speeches");
  assertEquals(result[0].speeches[0].speaker_id, "10295", "First speech should be by speaker with ID '10295'");
  assertEquals(result[0].speeches[1].speaker_id, null, "Second speech should have null speaker_id");

  // Test 7: Check if speech content is correctly concatenated
  assertTrue(result[0].speeches[0].content.includes("Before we begin today's proceedings"), "First speech should start with 'Before we begin today's proceedings'");
  assertTrue(result[0].speeches[0].content.includes("fantastic sense of humour."), "First speech should end with 'fantastic sense of humour.'");
  assertEquals(result[0].speeches[1].content, "Hear, hear!", "Second speech content should be 'Hear, hear!'");
});

// Helper function to check if a string includes another string
function assertTrue(condition: boolean, message: string) {
  assertEquals(condition, true, message);
}