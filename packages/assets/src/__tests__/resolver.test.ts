import { describe, expect, it } from "vitest";
import { createAssetResolver } from "../resolver.js";
import type { AssetManifest } from "../manifest.js";
import { approvedEntry } from "./fixtures.js";

function manifest(...assets: AssetManifest["assets"]): AssetManifest {
  return { manifestVersion: 1, assets };
}

describe("createAssetResolver", () => {
  it("falls back for every slot when there is no manifest (offline / no Higgsfield)", () => {
    const resolver = createAssetResolver(null);
    expect(resolver.resolve("dice.2d.face")).toBeNull();
    expect(resolver.resolveOr("dice.2d.face", () => "procedural")).toBe("procedural");
    expect(resolver.approvedSlots()).toEqual([]);
  });

  it("never serves concept, candidate or rejected assets", () => {
    const resolver = createAssetResolver(
      manifest(
        approvedEntry({ id: "a", status: "concept" }),
        approvedEntry({ id: "b", status: "candidate" }),
        approvedEntry({ id: "c", status: "rejected" }),
      ),
    );
    expect(resolver.resolve("dice.2d.face")).toBeNull();
  });

  it("serves the newest approved version of a slot", () => {
    const v2 = approvedEntry();
    const v3 = approvedEntry({
      id: "dice-2d-face-v3",
      version: 3,
      files: { source: "assets/source/dice-2d-face.v3.png", optimized: "assets/2d/dice/dice-2d-face.v3.svg" },
    });
    const resolved = createAssetResolver(manifest(v3, v2)).resolve("dice.2d.face");
    expect(resolved).toMatchObject({ id: "dice-2d-face-v3", version: 3, url: "/assets/2d/dice/dice-2d-face.v3.svg" });
  });

  it("maps optimised paths through a custom URL builder", () => {
    const resolver = createAssetResolver(manifest(approvedEntry()), {
      toUrl: (path) => `https://cdn.example/${path.replace(/^assets\//, "")}`,
    });
    expect(resolver.resolve("dice.2d.face")?.url).toBe("https://cdn.example/2d/dice/dice-2d-face.v2.svg");
    expect(resolver.approvedSlots()).toEqual(["dice.2d.face"]);
  });
});
