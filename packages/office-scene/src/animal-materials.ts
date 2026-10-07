import { MeshStandardMaterial, type SkinnedMesh } from 'three';

/** A ghost is see-through and faintly lit from within; everything else about it is its model. */
export function ghostly(mesh: SkinnedMesh): void {
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    if (!(material instanceof MeshStandardMaterial)) continue;
    material.transparent = true;
    material.opacity = 0.62;
    material.depthWrite = false;
    // The glow follows the texture, so the dark hollows of the face stay dark.
    material.emissive.set('#8fb4ff');
    material.emissiveMap = material.map;
    material.emissiveIntensity = 0.7;
    material.needsUpdate = true;
  }
}

/**
 * A soft light along the edge a surface turns away from the eye, in the cool tone of the office, so a character stands
 * out from the dark floor and keeps its shape against the glow behind it. Skipped on a phone (one more term in every
 * pixel's shading) and for the ghost, which glows by itself.
 */
export function rimLit(mesh: SkinnedMesh): void {
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    if (!(material instanceof MeshStandardMaterial)) continue;
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += vec3(0.42, 0.78, 0.9) * rim * 0.28;`,
      );
    };
    material.customProgramCacheKey = () => 'animal-rim';
    material.needsUpdate = true;
  }
}
