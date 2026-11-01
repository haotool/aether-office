import { MeshBasicMaterial } from 'three';
import { hashText } from '../environment/hash.js';
import { screenTexture } from '../screen/screens.js';

const FALLBACK_ROLE = 'generalist';
const ACCENT = '#43e6df';
const ROLE_OF_TYPE: Readonly<Record<string, string>> = {
  Explore: 'research',
  Plan: 'architect',
  'code-reviewer': 'review',
  'test-runner': 'qa',
  'security-reviewer': 'security',
  'general-purpose': FALLBACK_ROLE,
};

export const SCREEN_ROLES = [...new Set(Object.values(ROLE_OF_TYPE))];

export const screenRoleOf = (type: string): string =>
  ROLE_OF_TYPE[type] ?? SCREEN_ROLES[hashText(type) % SCREEN_ROLES.length] ?? FALLBACK_ROLE;

const materials = new Map<string, MeshBasicMaterial>();

export function screenMaterial(role: string): MeshBasicMaterial {
  let material = materials.get(role);
  if (!material) {
    material = new MeshBasicMaterial({ map: screenTexture(role, role, ACCENT), toneMapped: false });
    materials.set(role, material);
  }
  return material;
}
