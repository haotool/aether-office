import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Mesh, SkinnedMesh, MeshStandardMaterial, Texture, type Object3D } from 'three';
type Entry = {
  references: number;
  promise: Promise<GLTF>;
  model?: GLTF;
  cleanup?: ReturnType<typeof setTimeout>;
};
const entries = new Map<string, Entry>();
function disposeSource(scene: Object3D): void {
  const geometries = new Set<Mesh['geometry']>();
  const ownedMaterials = new Set<import('three').Material>();
  const textures = new Set<Texture>();
  scene.traverse((node) => {
    if (node instanceof Mesh) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        ownedMaterials.add(material);
        for (const value of Object.values(material))
          if (value instanceof Texture) textures.add(value);
      }
    }
    if (node instanceof SkinnedMesh) node.skeleton.dispose();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of ownedMaterials) material.dispose();
  for (const texture of textures) {
    const image = texture.source.data as { close?: () => void } | undefined;
    image?.close?.();
    texture.dispose();
  }
}
/** Every skinned mesh must carry the full PBR texture set, and there must be at least one: a bare model is refused. */
function checkAnimal(scene: Object3D): void {
  let meshes = 0;
  scene.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    meshes++;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const m of materials)
      if (
        !(m instanceof MeshStandardMaterial) ||
        !m.map ||
        !m.normalMap ||
        !m.roughnessMap ||
        !m.aoMap
      )
        throw new Error('ANIMAL_PBR_TEXTURE_MISSING');
  });
  if (!meshes) throw new Error('ANIMAL_SKIN_MISSING');
}

function loadEntry(url: string): Entry {
  const entry: Entry = {
    references: 0,
    promise: new GLTFLoader().loadAsync(url).then((gltf) => {
      try {
        checkAnimal(gltf.scene);
        return gltf;
      } catch (error) {
        disposeSource(gltf.scene);
        throw error;
      }
    }),
  };
  entries.set(url, entry);
  void entry.promise.then(
    (model) => {
      entry.model = model;
      if (entry.references === 0) scheduleDispose(url, entry);
    },
    () => {
      if (entries.get(url) === entry) entries.delete(url);
    },
  );
  return entry;
}

/** Geometry/textures are shared; cloned rigs and mixers belong to each actor. */
export function acquireAnimal(url: string) {
  const entry = entries.get(url) ?? loadEntry(url);
  if (entry.cleanup) clearTimeout(entry.cleanup);
  entry.references++;
  let released = false;
  const owned = entry;
  return {
    async load() {
      const gltf = await owned.promise;
      if (released) return null;
      return { scene: clone(gltf.scene), clips: gltf.animations };
    },
    release() {
      if (released) return;
      released = true;
      owned.references--;
      if (owned.references === 0) scheduleDispose(url, owned);
    },
  };
}
function scheduleDispose(url: string, entry: Entry): void {
  if (entry.cleanup) clearTimeout(entry.cleanup);
  entry.cleanup = setTimeout(() => {
    if (entry.references !== 0) return;
    if (entry.model) disposeSource(entry.model.scene);
    if (entries.get(url) === entry) entries.delete(url);
  }, 0);
}
