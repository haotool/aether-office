import {
  BufferAttribute,
  InterleavedBufferAttribute,
  Mesh,
  type Light,
  type LightShadow,
  type Object3D,
  type Texture,
} from 'three';

const MIP_OVERHEAD = 4 / 3;
const BYTES_PER_PIXEL = 4;

const textureBytes = (texture: Texture) => {
  const image = texture.image as { width?: number; height?: number } | null;
  if (!image?.width || !image.height) return 0;
  return (
    image.width * image.height * BYTES_PER_PIXEL * (texture.generateMipmaps ? MIP_OVERHEAD : 1)
  );
};

/**
 * What the scene holds on the GPU, from the sizes of what it uploaded: each texture once (with its mip chain),
 * each geometry's attributes once, plus the shadow maps and the drawing buffer. An estimate, not a driver figure:
 * WebGL does not report memory, and compressed or resident-on-demand formats differ.
 */
export function estimateGpuBytes(scene: Object3D, drawingBufferPixels: number): number {
  const textures = new Set<Texture>();
  const attributes = new Set<unknown>();
  let bytes = 0;
  scene.traverse((node) => {
    const light = node as Light & { shadow?: LightShadow };
    if (light.isLight && light.castShadow && light.shadow)
      bytes += light.shadow.mapSize.x * light.shadow.mapSize.y * 4 * 2; // depth map and its blur target
    if (!(node instanceof Mesh) && !('geometry' in node)) return;
    const holder = node as Mesh;
    for (const attribute of Object.values(holder.geometry?.attributes ?? {}))
      attributes.add(attribute instanceof InterleavedBufferAttribute ? attribute.data : attribute);
    if (holder.geometry?.index) attributes.add(holder.geometry.index);
    for (const material of [holder.material].flat())
      for (const value of Object.values(material ?? {}))
        if (value && (value as Texture).isTexture) textures.add(value as Texture);
  });
  for (const texture of textures) bytes += textureBytes(texture);
  for (const attribute of attributes) {
    const array = (attribute as BufferAttribute).array as ArrayBufferView | undefined;
    if (array) bytes += array.byteLength;
  }
  bytes += drawingBufferPixels * BYTES_PER_PIXEL * 2; // colour and depth
  return bytes;
}

/** What `?perf` leaves on `window` so a script can re-sample frame times after changing the scene (a measurement aid). */
export type PerfRig = {
  sample: (frames: number) => Promise<import('./perf.js').PerfReport>;
  scene: Object3D;
  gl: import('three').WebGLRenderer;
  /** The scene's camera, for a script that checks where a camera move left it. */
  camera: import('three').Camera;
};
