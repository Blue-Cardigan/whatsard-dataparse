import { assertEquals, assertRejects } from "std/testing/asserts.ts";
import { fetchXMLData } from "../debates/fetchxml.js";

Deno.test("fetchXMLData fetches XML data successfully", async () => {
  const mockXMLData = '<xml>Some data</xml>';
  globalThis.fetch = async () => new Response(mockXMLData, { status: 200 });

  const result = await fetchXMLData(new Date('2023-07-30'));
  assertEquals(result, mockXMLData);
});

Deno.test("fetchXMLData throws an error when fetch fails", async () => {
  globalThis.fetch = async () => new Response(null, { status: 404 });

  await assertRejects(
    () => fetchXMLData(new Date('2024-07-30')),
    Error,
    'HTTP error! status: 404'
  );
});