import { test } from "node:test";
import assert from "node:assert/strict";
import { puanlariCoz } from "./puan";

test("KPSS puanları", () => {
  assert.deepEqual(puanlariCoz("P3 78.5 P94 81", "kpss", "lisans"), { P3: 78.5, P94: 81 });
  assert.deepEqual(puanlariCoz("p3=80,25", "kpss", "lisans"), { P3: 80.25 });
  assert.deepEqual(puanlariCoz("76,4", "kpss", "lisans"), { P3: 76.4 });
  assert.deepEqual(puanlariCoz("76", "kpss", "onlisans"), { P93: 76 });
  assert.equal(puanlariCoz("bilmiyorum", "kpss", "lisans"), null);
});

test("ALES puanları", () => {
  assert.deepEqual(puanlariCoz("SAY 75 EA 70", "ales", "lisans"), { SAY: 75, EA: 70 });
  assert.deepEqual(puanlariCoz("söz: 68.2", "ales", "lisans"), { SOZ: 68.2 });
  assert.deepEqual(puanlariCoz("72", "ales", "lisans"), { SAY: 72 });
});
