// Dithering for the soft, dark, additive gradients (light shafts, beams, clouds, glass strands, holograms): an 8-bit frame
// buffer shows their slow ramps as bands, and three's own `dithering` (+-0.5 LSB, one hash per pixel) breaks them up.
//
// Measured on a synthetic strip (docs/internal/mobile-gradient-perf.md and docs/design-system.md): three adds the noise to the
// colour BEFORE the alpha multiplies it, so on a low-alpha ramp the noise is scaled away and nothing changes (row-mean error
// 0.278 against 0.291 LSB without it). The noise helps only when it is added to the colour that is blended, so these
// materials are premultiplied (`premultipliedAlpha`, which makes three blend with ONE instead of SRC_ALPHA: the same result
// for additive and normal blending) and take the noise last (0.025 LSB).

/** In a fragment shader, before `main`: the hash `dithering()` uses and the function itself. */
export const DITHER_PARS = /* glsl */ `
  #include <common>
  #include <dithering_pars_fragment>`;

/** In a fragment shader, after the colour (and `colorspace_fragment`) is final: multiply in alpha, then add the noise. */
export const DITHER_END = /* glsl */ `
  #include <premultiplied_alpha_fragment>
  #include <dithering_fragment>`;

/** Material options that turn the two on together; the shader needs `DITHER_PARS` and `DITHER_END`. */
export const DITHERED = { premultipliedAlpha: true, dithering: true } as const;
