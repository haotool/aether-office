import { useMemo, useEffect } from 'react';
import { earthTextureSize } from '../perf/perf-control.js';
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  SRGBColorSpace,
  BufferGeometry,
  Float32BufferAttribute,
  Color,
} from 'three';
import { context2d } from '../core/canvas-2d.js';
const continents = [
  [
    [-168, 68],
    [-142, 72],
    [-127, 58],
    [-105, 72],
    [-57, 55],
    [-66, 44],
    [-82, 26],
    [-98, 17],
    [-114, 30],
    [-126, 50],
  ],
  [
    [-82, 12],
    [-69, 10],
    [-48, -2],
    [-35, -10],
    [-50, -30],
    [-68, -55],
    [-76, -30],
  ],
  [
    [-17, 35],
    [10, 38],
    [35, 30],
    [51, 10],
    [40, -17],
    [18, -35],
    [8, -20],
    [-8, 7],
  ],
  [
    [-10, 36],
    [-10, 55],
    [10, 70],
    [35, 70],
    [50, 56],
    [80, 74],
    [139, 70],
    [177, 55],
    [148, 42],
    [130, 31],
    [121, 5],
    [100, 2],
    [77, 9],
    [63, 25],
    [40, 42],
    [27, 37],
  ],
  [
    [112, -12],
    [137, -10],
    [154, -25],
    [144, -40],
    [116, -34],
  ],
  [
    [-54, 59],
    [-26, 70],
    [-35, 82],
    [-61, 81],
    [-72, 65],
  ],
  [
    [47, -14],
    [50, -16],
    [49, -24],
    [44, -25],
  ],
];
type Paint = CanvasRenderingContext2D;

function paintOcean(ctx: Paint) {
  const ocean = ctx.createLinearGradient(0, 0, 0, 1024);
  ocean.addColorStop(0, '#315867');
  ocean.addColorStop(0.45, '#123b51');
  ocean.addColorStop(1, '#3d6472');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, 2048, 1024);
}

function paintContinents(ctx: Paint, scale: number) {
  const xy = ([lon = 0, lat = 0]: number[]): [number, number] => [
    ((lon + 180) / 360) * 2048,
    ((90 - lat) / 180) * 1024,
  ];
  for (const polygon of continents) {
    ctx.beginPath();
    polygon.forEach((point, i) => {
      const [x, y] = xy(point);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = '#758976';
    ctx.shadowColor = '#779e99';
    ctx.shadowBlur = 12 * scale;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function paintClouds(ctx: Paint) {
  for (let i = 0; i < 150; i++) {
    const x = (Math.sin(i * 31.73) * 0.5 + 0.5) * 2048,
      y = (Math.sin(i * 7.11) * 0.5 + 0.5) * 890 + 67;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, 70);
    cloud.addColorStop(0, 'rgba(236,244,239,.4)');
    cloud.addColorStop(1, 'rgba(236,244,239,0)');
    ctx.fillStyle = cloud;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(i) * 0.6);
    ctx.scale(2.5, 0.38);
    ctx.translate(-x, -y);
    ctx.fillRect(x - 70, y - 70, 140, 140);
    ctx.restore();
  }
}

function paintPolarCaps(ctx: Paint) {
  const polar = ctx.createLinearGradient(0, 0, 0, 1024);
  polar.addColorStop(0, 'rgba(225,237,231,.9)');
  polar.addColorStop(0.12, 'rgba(225,237,231,0)');
  polar.addColorStop(0.87, 'rgba(225,237,231,0)');
  polar.addColorStop(1, 'rgba(225,237,231,.9)');
  ctx.fillStyle = polar;
  ctx.fillRect(0, 0, 2048, 1024);
}

function earthTexture(small: boolean) {
  const { width, height } = earthTextureSize(small);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_TEXTURE_UNAVAILABLE');
  const scale = width / 2048;
  ctx.scale(scale, scale);
  paintOcean(ctx);
  paintContinents(ctx, scale);
  paintClouds(ctx);
  paintPolarCaps(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
function glowTexture(inner: string, outer: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = context2d(canvas);
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const NEBULAE = [
  { position: [-320, 120, -520], scale: 420, color: 'rgba(120,90,255,.55)' },
  { position: [380, 40, -480], scale: 360, color: 'rgba(40,220,230,.4)' },
  { position: [60, 260, -640], scale: 520, color: 'rgba(255,90,170,.28)' },
] as const;

function starField(low: boolean): BufferGeometry {
  const geometry = new BufferGeometry();
  const points: number[] = [];
  const colors: number[] = [];
  const count = low ? 400 : 1600;
  const tint = new Color();
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399963,
      y = 1 - (2 * (i + 0.5)) / count,
      r = Math.sqrt(1 - y * y),
      radius = 900 + (i % 5) * 60;
    points.push(Math.cos(angle) * r * radius, y * radius, Math.sin(angle) * r * radius);
    tint.setHSL(0.5 + ((i * 7) % 20) / 100, 0.6, 0.78 + ((i * 13) % 10) / 60);
    colors.push(tint.r, tint.g, tint.b);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function Planet({ texture, low }: { texture: CanvasTexture; low: boolean }) {
  return (
    <group position={[-70, 30, -190]} rotation={[0.06, 1.6, -0.2]}>
      <mesh>
        <sphereGeometry args={[62, low ? 40 : 96, low ? 24 : 64]} />
        <meshStandardMaterial
          map={texture}
          roughness={1}
          emissive={new Color('#245368')}
          emissiveIntensity={0.18}
        />
      </mesh>
      <mesh scale={1.025}>
        <sphereGeometry args={[62, 48, 32]} />
        <meshBasicMaterial color="#6fd9ff" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <mesh scale={1.07}>
        <sphereGeometry args={[62, 48, 32]} />
        <meshBasicMaterial
          color="#4bd8ff"
          transparent
          opacity={0.05}
          depthWrite={false}
          side={BackSide}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function Orbits() {
  return (
    <>
      <mesh position={[-70, 30, -190]} rotation={[1.2, 0.2, 0.15]}>
        <torusGeometry args={[88, 0.35, 8, 160]} />
        <meshBasicMaterial color="#5ee7e7" transparent opacity={0.55} fog={false} />
      </mesh>
      <mesh position={[-70, 30, -190]} rotation={[1.05, 0.5, -0.1]}>
        <torusGeometry args={[102, 0.18, 8, 160]} />
        <meshBasicMaterial color="#9d8cff" transparent opacity={0.4} fog={false} />
      </mesh>
      <group position={[210, 90, -260]} rotation={[0.3, -0.6, 0.2]}>
        <mesh>
          <torusGeometry args={[26, 1.6, 10, 64]} />
          <meshStandardMaterial
            color="#1a2c3a"
            metalness={0.8}
            roughness={0.35}
            emissive="#1f6f7a"
            emissiveIntensity={0.5}
          />
        </mesh>
        <mesh>
          <cylinderGeometry args={[3, 3, 70, 16]} />
          <meshStandardMaterial
            color="#14222d"
            metalness={0.8}
            roughness={0.4}
            emissive="#4be3dc"
            emissiveIntensity={0.25}
          />
        </mesh>
      </group>
    </>
  );
}

export function OrbitalBackdrop({ low }: { low: boolean }) {
  const texture = useMemo(() => earthTexture(low), [low]);
  const nebulae = useMemo(
    () => NEBULAE.map((n) => ({ ...n, glow: glowTexture(n.color, 'rgba(0,0,0,0)') })),
    [],
  );
  const stars = useMemo(() => starField(low), [low]);
  useEffect(
    () => () => {
      texture.dispose();
      for (const n of nebulae) n.glow.dispose();
    },
    [texture, nebulae],
  );
  useEffect(() => () => stars.dispose(), [stars]);
  return (
    <group>
      <points geometry={stars}>
        <pointsMaterial
          vertexColors
          size={1.7}
          sizeAttenuation={false}
          transparent
          opacity={0.9}
          fog={false}
        />
      </points>
      {!low &&
        nebulae.map((n, i) => (
          <sprite key={i} position={[...n.position]} scale={[n.scale, n.scale, 1]}>
            <spriteMaterial
              map={n.glow}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              fog={false}
            />
          </sprite>
        ))}
      <Planet texture={texture} low={low} />
      <Orbits />
    </group>
  );
}
