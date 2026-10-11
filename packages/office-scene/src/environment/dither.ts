// Dithering for the soft, dark, additive gradients (light shafts, beams, clouds, glass strands, holograms): an 8-bit
// frame buffer shows their slow ramps as bands, and three's own `dithering` (+-0.5 LSB, one hash per pixel) breaks them
// up.

export const DITHER_PARS = /* glsl */ `
  #include <common>
  #include <dithering_pars_fragment>`;

export const DITHER_END = /* glsl */ `
  #include <premultiplied_alpha_fragment>
  #include <dithering_fragment>`;

export const DITHERED = { premultipliedAlpha: true, dithering: true } as const;
