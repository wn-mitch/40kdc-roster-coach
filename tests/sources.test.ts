import assert from "node:assert/strict";
import test from "node:test";
import { assertListhammerUrl } from "../src/sources.js";

test("Listhammer capture rejects other hosts and insecure URLs", () => {
  assert.throws(() => assertListhammerUrl("https://example.test/list"), /Listhammer/);
  assert.throws(() => assertListhammerUrl("http://listhammer.info/list"), /Listhammer/);
  assert.equal(assertListhammerUrl("https://listhammer.info/factions/necrons#top").toString(), "https://listhammer.info/factions/necrons");
});
