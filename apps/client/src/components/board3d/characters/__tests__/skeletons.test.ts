// A character's primitives share one skeleton after cloning (one set of bone matrices and one bone
// texture per character, not one per material).
import { describe, expect, it } from "vitest";
import { Bone, BufferGeometry, Float32BufferAttribute, Group, MeshBasicMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { shareSkeletons } from "../CharacterBody";

function character(primitives: number): Group {
  const root = new Group();
  const hips = new Bone();
  const spine = new Bone();
  hips.add(spine);
  root.add(hips);
  const skeleton = new Skeleton([hips, spine]);
  for (let i = 0; i < primitives; i++) {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3));
    g.setAttribute("skinIndex", new Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    g.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const mesh = new SkinnedMesh(g, new MeshBasicMaterial());
    root.add(mesh);
    mesh.bind(skeleton);
  }
  return root;
}

const skeletonsOf = (root: Group) => {
  const found = new Set<Skeleton>();
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) found.add((o as SkinnedMesh).skeleton);
  });
  return found;
};

describe("shareSkeletons", () => {
  it("binds every primitive of a cloned character to one skeleton driving the clone's bones", () => {
    const copy = clone(character(5)) as Group;
    expect(skeletonsOf(copy).size, "SkeletonUtils.clone: one skeleton per primitive").toBe(5);
    const kept = shareSkeletons(copy);
    expect(kept).toHaveLength(1);
    expect(skeletonsOf(copy)).toEqual(new Set(kept));
    const bones: Bone[] = [];
    copy.traverse((o) => {
      if ((o as Bone).isBone) bones.push(o as Bone);
    });
    expect(kept[0]!.bones).toEqual(bones);
  });

  it("keeps separate skeletons for different bones (two characters under one root)", () => {
    const both = new Group();
    both.add(clone(character(3)), clone(character(2)));
    expect(shareSkeletons(both)).toHaveLength(2);
    expect(skeletonsOf(both).size).toBe(2);
  });
});
