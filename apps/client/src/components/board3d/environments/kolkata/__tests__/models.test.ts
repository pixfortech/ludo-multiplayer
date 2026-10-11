// The procedural models stay inside the footprints and heights the layout
// declares (so the tested sightline and placement rules describe what is
// actually drawn), carry vertex colours, and keep to triangle budgets.
import { describe, expect, it } from "vitest";
import type { BufferAttribute, BufferGeometry } from "three";
import { Builder } from "../../kit";
import { buildBiswaBanglaGate, buildHowrahBridge, buildHowrahStation, buildShaheedMinar, buildVictoriaMemorial, buildWritersBuilding } from "../landmarks";
import { buildContemporaryDistrict, buildCulturalDistrict, buildHeritageDistrict, buildMaidanFurniture, buildRailings, buildRiversideDistrict } from "../districts";
import { BOARD_CLEAR, GROUND_Y, LANDMARKS, WATER_Y } from "../layout";

const triangles = (g: BufferGeometry) => g.getAttribute("position").count / 3;
const LEVELS = ["low", "medium", "high"] as const;

const MODELS = {
  "howrah-bridge": buildHowrahBridge,
  "victoria-memorial": buildVictoriaMemorial,
  "writers-building": buildWritersBuilding,
  "shaheed-minar": buildShaheedMinar,
  "biswa-bangla-gate": buildBiswaBanglaGate,
  "howrah-station": buildHowrahStation,
  "heritage-houses": buildHeritageDistrict,
  ghats: buildRiversideDistrict,
  "book-stalls": buildCulturalDistrict,
  maidan: () => buildMaidanFurniture(),
  "contemporary-towers": (d: "low" | "medium" | "high") => buildContemporaryDistrict(d).glass,
} as const;

describe("Kolkata models", () => {
  it.each(Object.entries(MODELS))("%s stays inside its layout footprint and height", (id, build) => {
    const box = LANDMARKS.find((l) => l.id === id)!.box;
    for (const level of LEVELS) {
      const g = build(level);
      const bb = g.boundingBox!;
      const slack = 0.35;
      expect(bb.min.x, `${id} ${level} west`).toBeGreaterThanOrEqual(box.minX - slack);
      expect(bb.max.x, `${id} ${level} east`).toBeLessThanOrEqual(box.maxX + slack);
      expect(bb.min.z, `${id} ${level} north`).toBeGreaterThanOrEqual(box.minZ - slack);
      expect(bb.max.z, `${id} ${level} south`).toBeLessThanOrEqual(box.maxZ + slack);
      expect(bb.max.y, `${id} ${level} height`).toBeLessThanOrEqual(GROUND_Y + box.height + 0.05);
      expect(bb.min.y, `${id} ${level} not below the river bed`).toBeGreaterThanOrEqual(WATER_Y - 0.2);
      expect(g.getAttribute("color"), `${id} has vertex colours`).toBeTruthy();
      g.dispose();
    }
  });

  it("keeps every part of every model off the board (railings ring it, so each triangle is checked)", () => {
    const builds = { ...MODELS, railings: buildRailings, "contemporary-solid": (d: "low" | "medium" | "high") => buildContemporaryDistrict(d).solid };
    for (const [id, build] of Object.entries(builds)) {
      const pos = build("high").getAttribute("position") as BufferAttribute;
      for (let i = 0; i < pos.count; i += 3) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let k = 0; k < 3; k++) {
          minX = Math.min(minX, pos.getX(i + k));
          maxX = Math.max(maxX, pos.getX(i + k));
          minZ = Math.min(minZ, pos.getZ(i + k));
          maxZ = Math.max(maxZ, pos.getZ(i + k));
        }
        const overlaps = maxX > -BOARD_CLEAR && minX < BOARD_CLEAR && maxZ > -BOARD_CLEAR && minZ < BOARD_CLEAR;
        if (overlaps) expect.fail(`${id}: triangle ${i / 3} reaches the board (x ${minX.toFixed(2)}..${maxX.toFixed(2)}, z ${minZ.toFixed(2)}..${maxZ.toFixed(2)})`);
      }
    }
  });

  it("keeps to triangle budgets: Low well under Medium, everything under 60k on High", () => {
    const total = (level: (typeof LEVELS)[number]) =>
      Object.values(MODELS).reduce((sum, build) => sum + triangles(build(level)), 0) + triangles(buildRailings(level)) + triangles(buildContemporaryDistrict(level).solid);
    const low = total("low");
    const medium = total("medium");
    const high = total("high");
    console.log(`Kolkata static triangles: low ${low}, medium ${medium}, high ${high}`);
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThanOrEqual(high);
    expect(high).toBeLessThan(60_000);
  });

  it("builds prisms with outward faces in both orientations", () => {
    for (const alongZ of [false, true]) {
      const g = new Builder().prism(0, 0, 2, 1, 4, 0, "#ffffff", alongZ).build();
      const pos = g.getAttribute("position") as BufferAttribute;
      const nor = g.getAttribute("normal") as BufferAttribute;
      // Each face's normal points away from the prism's centre (0, 1/3, 0).
      for (let i = 0; i < pos.count; i += 3) {
        const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
        const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 - 1 / 3;
        const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        expect(cx * nor.getX(i) + cy * nor.getY(i) + cz * nor.getZ(i), `face ${i / 3} (alongZ ${alongZ})`).toBeGreaterThan(0);
      }
    }
  });
});
