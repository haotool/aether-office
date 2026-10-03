import * as THREE from 'three';
import type { Layout } from '@aether/contracts';
import { box, mergeStatic } from './geometry.js';
export function buildCampus(layout: Layout): THREE.Group {
  const m = {
    base: new THREE.MeshStandardMaterial({ color: '#172735', metalness: 0.6, roughness: 0.45 }),
    seam: new THREE.MeshStandardMaterial({ color: '#aebec4', roughness: 0.9 }),
    floor: new THREE.MeshStandardMaterial({ color: '#ccd6d8', roughness: 0.72, metalness: 0.1 }),
    white: new THREE.MeshStandardMaterial({ color: '#eef0e8', roughness: 0.52, metalness: 0.18 }),
    graphite: new THREE.MeshStandardMaterial({ color: '#263840', roughness: 0.48, metalness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ color: '#b69066', roughness: 0.75 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#41716d', roughness: 0.95 }),
    screen: new THREE.MeshStandardMaterial({
      color: '#142f3a',
      emissive: '#316673',
      emissiveIntensity: 0.25,
      metalness: 0.2,
      roughness: 0.4,
    }),
    cyan: new THREE.MeshStandardMaterial({
      color: '#76d7d7',
      emissive: '#4a9b9d',
      emissiveIntensity: 0.5,
    }),
    green: new THREE.MeshStandardMaterial({ color: '#417758', roughness: 0.85 }),
    darkgreen: new THREE.MeshStandardMaterial({ color: '#244c3f', roughness: 0.9 }),
    gold: new THREE.MeshStandardMaterial({ color: '#cea570', metalness: 0.45, roughness: 0.45 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#9cc7cc',
      transparent: true,
      opacity: 0.18,
      roughness: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
  const root = new THREE.Group();
  box(root, m.base, [53.2, 0.8, 37.2], [0, -0.6, 0], 1.3);
  box(root, m.floor, [52, 0.25, 36], [0, -0.12, 0], 1);
  // Panel joints, edge guides and generous circulation spines.
  for (let x = -24; x <= 24; x += 4) box(root, m.seam, [0.025, 0.012, 35], [x, 0.014, 0], 0);
  for (let z = -16; z <= 16; z += 4) box(root, m.seam, [51, 0.012, 0.025], [0, 0.014, z], 0);
  for (const x of [-1.2, 1.2]) box(root, m.cyan, [0.06, 0.02, 31], [x, 0.035, 0]);
  for (const z of [-1, 1]) box(root, m.cyan, [48, 0.02, 0.06], [0, 0.035, z]);
  for (const [x, z, w, d] of [
    [-17, -4.3, 15, 8.5],
    [16, -4.3, 15, 8.5],
    [-17, -13, 16, 7],
    [16, -13, 16, 7],
    [-17, 11, 16, 8],
    [16, 11, 16, 8],
  ]) {
    box(root, m.white, [w!, 0.045, d!], [x!, 0.04, z!], 0.45);
    box(root, m.graphite, [w! - 0.4, 0.048, 0.05], [x!, 0.07, z! - d! / 2 + 0.25]);
  }
  // Rear cutaway facade: genuine framed glass with structural mullions and equipment details.
  box(root, m.white, [52, 0.35, 0.5], [0, 4.7, -17.65]);
  box(root, m.graphite, [52, 0.25, 0.7], [0, 0.24, -17.65]);
  for (let x = -24; x <= 24; x += 6) {
    box(root, m.white, [0.24, 4.5, 0.45], [x, 2.3, -17.6]);
    if (x < 24) box(root, m.glass, [5.7, 4.1, 0.08], [x + 3, 2.4, -17.65]);
  }
  for (const x of [-25.6, 25.6]) {
    box(root, m.white, [0.45, 1.8, 36], [x, 0.9, 0]);
    box(root, m.gold, [0.5, 0.05, 35], [x, 1.82, 0]);
    for (const z of [-15, -6, 6, 15]) {
      box(root, m.white, [0.6, 4.4, 0.6], [x, 2.2, z]);
      box(root, m.cyan, [0.08, 2.8, 0.63], [x + 0.31, 2.4, z]);
    }
  }
  // North rooms have open doorways. Front and ceiling stay cut away for overview readability.
  for (const x of [-8.2, 8.2]) {
    for (const z of [-17.2, -10]) box(root, m.graphite, [0.13, 3.6, 0.13], [x, 1.8, z]);
    for (const y of [0.16, 3.6]) box(root, m.graphite, [0.13, 0.13, 7.2], [x, y, -13.6]);
    box(root, m.glass, [0.08, 3.2, 6.9], [x, 1.8, -13.6]);
  }
  for (const x of [-18, 18]) {
    box(root, m.graphite, [13.5, 0.12, 0.16], [x, 3.6, -9.2]);
    box(root, m.glass, [13.4, 2.8, 0.08], [x, 2.1, -9.2]);
  }
  // Orbital hull, service beams and light channels remain visible in the cutaway.
  box(root, m.graphite, [49, 1.2, 32], [0, -1.4, 0], 2);
  for (const x of [-20, -10, 0, 10, 20]) {
    box(root, m.base, [1.2, 1.8, 34], [x, -2, 0]);
    box(root, m.cyan, [0.18, 0.12, 28], [x, -2.94, 0]);
  }
  for (const z of [-18.2, 18.2]) {
    box(root, m.gold, [48, 0.08, 0.12], [0, -0.65, z]);
    for (let x = -22; x <= 22; x += 4) box(root, m.cyan, [1.2, 0.15, 0.1], [x, -0.45, z]);
  }
  for (const x of [-24.5, 24.5]) {
    box(root, m.white, [0.2, 0.18, 30], [x, 4.65, 0]);
    for (const z of [-6, 7]) {
      box(root, m.white, [4, 0.2, 0.2], [x + (x < 0 ? 1.8 : -1.8), 4.65, z]);
      box(root, m.cyan, [3.3, 0.045, 0.1], [x + (x < 0 ? 1.8 : -1.8), 4.52, z]);
    }
  }
  // Central floor hologram is an unobstructed projection, not a blocking solid table.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.09, 8, 72), m.gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.06;
  root.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.025, 6, 72), m.cyan);
  inner.rotation.x = Math.PI / 2;
  inner.position.y = 0.06;
  root.add(inner);
  for (const x of [-4.5, 4.5]) {
    box(root, m.wood, [5.1, 0.13, 2], [x, 0.8, -12.5], 0.4);
    box(root, m.graphite, [2.8, 0.7, 0.25], [x, 0.36, -12.5]);
  }
  // Knowledge archive: shelf spines with a quiet shared display.
  for (const x of [11, 15, 19, 23]) {
    box(root, m.graphite, [2.6, 3.7, 0.5], [x, 1.85, -15.7]);
    for (let h = 0.4; h < 3.5; h += 0.65) {
      box(root, m.wood, [2.5, 0.07, 0.65], [x, h, -15.55]);
      for (let j = 0; j < 7; j++)
        box(
          root,
          j % 3 === 0 ? m.cyan : m.white,
          [0.18, 0.43, 0.38],
          [x - 0.95 + j * 0.3, h + 0.25, -15.6],
        );
    }
  }
  // Lounge kitchenette and botanical nook, with distinct practical fixtures.
  box(root, m.wood, [9, 0.12, 1.1], [-17, 0.96, 15.8], 0.15);
  for (const x of [-20, -17, -14]) {
    box(root, m.white, [2.7, 0.88, 1], [x, 0.44, 15.8], 0.08);
    box(root, m.gold, [0.5, 0.025, 0.04], [x, 0.78, 15.27]);
  }
  box(root, m.graphite, [0.65, 0.65, 0.5], [-20, 1.32, 15.65], 0.08);
  box(root, m.cyan, [0.23, 0.15, 0.012], [-20, 1.47, 15.38]);
  for (const x of [-19.8, -19.4, -17.5]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.2, 12), m.white);
    cup.position.set(x, 1.12, 15.25);
    root.add(cup);
  }
  const loungeTable = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.12, 48), m.wood);
  loungeTable.position.set(-18.5, 0.55, 9.6);
  root.add(loungeTable);
  box(root, m.graphite, [0.25, 0.5, 0.25], [-18.5, 0.25, 9.6]);
  // Welcome desk and integration console; intentionally no invented activity numbers.
  for (const x of [-3.5, 3.5]) {
    box(root, m.white, [4.2, 0.9, 1.4], [x, 0.45, 13.5], 0.35);
    box(root, m.wood, [4.4, 0.1, 1.5], [x, 0.95, 13.5], 0.3);
  }
  box(root, m.graphite, [10, 2.7, 0.24], [17, 1.4, 15.7]);
  box(root, m.screen, [9.5, 2.2, 0.04], [17, 1.55, 15.54]);
  for (const object of layout.objects) {
    const group = new THREE.Group();
    if (object.type === 'desk') {
      box(group, m.wood, [1.72, 0.09, 0.85], [0, 0.76, 0], 0.09);
      box(group, m.graphite, [1.35, 0.08, 0.12], [0, 0.65, 0.1]);
      for (const x of [-0.64, 0.64]) {
        box(group, m.white, [0.08, 0.65, 0.08], [x, 0.36, 0]);
        box(group, m.graphite, [0.16, 0.05, 0.68], [x, 0.055, 0]);
      }
      box(group, m.graphite, [0.065, 0.36, 0.06], [0, 1.0, -0.16]);
      box(group, m.graphite, [0.28, 0.04, 0.23], [0, 0.835, -0.16]);
      box(group, m.graphite, [0.86, 0.48, 0.055], [0, 1.19, -0.23], 0.04);
      box(group, m.screen, [0.8, 0.42, 0.012], [0, 1.2, -0.194], 0.02);
      box(group, m.graphite, [0.43, 0.025, 0.16], [-0.09, 0.825, 0.3]);
      for (let i = 0; i < 11; i++)
        for (let j = 0; j < 3; j++)
          box(
            group,
            m.white,
            [0.027, 0.01, 0.025],
            [-0.27 + i * 0.034, 0.843, 0.255 + j * 0.045],
            0.002,
          );
      box(group, m.white, [0.075, 0.025, 0.11], [0.36, 0.83, 0.3], 0.035);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.14, 12), m.white);
      cup.position.set(0.62, 0.86, -0.16);
      group.add(cup);
      box(group, m.fabric, [0.5, 0.12, 0.49], [0, 0.45, 0.9], 0.12);
      box(group, m.fabric, [0.5, 0.55, 0.1], [0, 0.75, 1.12], 0.1);
      for (const x of [-0.29, 0.29]) box(group, m.graphite, [0.065, 0.05, 0.32], [x, 0.66, 0.91]);
      box(group, m.graphite, [0.06, 0.35, 0.06], [0, 0.23, 0.9]);
      box(group, m.graphite, [0.48, 0.04, 0.35], [0, 0.15, 0.37], 0.035);
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        const leg = box(
          group,
          m.graphite,
          [0.065, 0.055, 0.36],
          [Math.sin(a) * 0.14, 0.05, 0.9 + Math.cos(a) * 0.14],
        );
        leg.rotation.y = a;
      }
    } else if (object.type === 'rack') {
      box(group, m.graphite, [1.1, 2.45, 0.9], [0, 1.23, 0], 0.07);
      for (let y = 0.25; y < 2.3; y += 0.25) {
        box(group, m.base, [0.91, 0.19, 0.035], [0, y, 0.47]);
        box(group, m.cyan, [0.025, 0.045, 0.04], [-0.37, y, 0.49]);
        for (let i = 0; i < 8; i++)
          box(group, m.graphite, [0.045, 0.1, 0.04], [-0.2 + i * 0.08, y, 0.49]);
      }
    } else if (object.type === 'sofa') {
      box(group, m.wood, [3.1, 0.25, 1.12], [0, 0.25, 0], 0.15);
      box(group, m.fabric, [3.0, 0.3, 1.05], [0, 0.52, 0], 0.18);
      box(group, m.fabric, [3.1, 0.7, 0.25], [0, 0.78, -0.48], 0.12);
      for (const x of [-1.44, 1.44]) box(group, m.fabric, [0.25, 0.45, 1.1], [x, 0.68, 0], 0.12);
    } else if (object.type === 'plant') {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.52, 14), m.white);
      pot.position.y = 0.27;
      group.add(pot);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.8, 7), m.wood);
      trunk.position.y = 0.88;
      group.add(trunk);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.399;
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 8, 6),
          i % 2 ? m.green : m.darkgreen,
        );
        leaf.scale.set(0.48, 1.45, 0.75);
        leaf.rotation.set(0.3, a, 0.7);
        leaf.position.set(Math.sin(a) * 0.19, 0.85 + i * 0.085, Math.cos(a) * 0.19);
        group.add(leaf);
      }
    } else {
      box(group, m.wood, [3, 0.12, 2], [0, 0.74, 0], 0.15);
      for (const x of [-1, 1]) box(group, m.graphite, [0.12, 0.65, 1.2], [x, 0.35, 0]);
    }
    group.position.set(object.x, 0, object.z);
    group.rotation.y = (object.rotation * Math.PI) / 2;
    root.add(group);
  }
  return mergeStatic(root);
}
