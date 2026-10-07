import { expect, it } from 'vitest';
import type { ShaderMaterial } from 'three';
import { createBeam } from '../../packages/office-scene/src/squad/beam-shader.js';
import { createZoneDecal } from '../../packages/office-scene/src/squad/zone-shader.js';
import { createMaterials } from '../../packages/office-scene/src/building-materials.js';
import { gardenMaterial, pollenMaterial } from '../../packages/office-scene/src/garden-material.js';
import { stalkMaterial } from '../../packages/office-scene/src/stalk-materials.js';

// The soft additive gradients take three's dithering last, on the colour that is blended (see dither.ts). A material that
// loses the flag, or the two chunks, would band again without anything failing: this pins the wiring.
const premultiplied: Record<string, ShaderMaterial> = {
  'squad beam': createBeam().material,
  'squad zone decal': createZoneDecal().material,
  hologram: createMaterials('#5ee7e7').hologram as ShaderMaterial,
};
// These write their own alpha (premultiplied petals, alpha 1 for additive light), so only the noise is added.
const noiseOnly: Record<string, ShaderMaterial> = {
  petals: gardenMaterial(),
  pollen: pollenMaterial(),
  'glass strands': stalkMaterial(),
};

it.each(Object.entries({ ...premultiplied, ...noiseOnly }))('%s dithers its output', (_, m) => {
  expect(m.dithering).toBe(true);
  expect(m.fragmentShader).toContain('#include <dithering_pars_fragment>');
  expect(m.fragmentShader).toContain('#include <dithering_fragment>');
  expect(m.fragmentShader.indexOf('<dithering_fragment>')).toBeGreaterThan(
    m.fragmentShader.indexOf('gl_FragColor'),
  );
});

it.each(Object.entries(premultiplied))(
  '%s blends premultiplied, so the noise survives the alpha',
  (_, m) => {
    expect(m.premultipliedAlpha).toBe(true);
    expect(m.fragmentShader).toContain('#include <premultiplied_alpha_fragment>');
  },
);
