import type { ShaderMaterial } from 'three';

/** Sets a uniform of a shader the scene wrote itself (a name the material does not have is ignored). */
export function setUniform(material: ShaderMaterial, name: string, value: unknown): void {
  const uniform = material.uniforms[name];
  if (uniform) uniform.value = value;
}
