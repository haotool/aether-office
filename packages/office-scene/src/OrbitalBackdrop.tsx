import { useMemo, useEffect } from 'react';
import {
  CanvasTexture,
  SRGBColorSpace,
  BufferGeometry,
  Float32BufferAttribute,
  Color,
} from 'three';
// Original stylized cartography, hand-authored for the orbital-office backdrop.
// These coarse silhouettes are decorative and are not a geographical dataset.
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
function earthTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_TEXTURE_UNAVAILABLE');
  const ocean = ctx.createLinearGradient(0, 0, 0, 1024);
  ocean.addColorStop(0, '#315867');
  ocean.addColorStop(0.45, '#123b51');
  ocean.addColorStop(1, '#3d6472');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, 2048, 1024);
  const xy = ([lon, lat]: number[]) => [((lon! + 180) / 360) * 2048, ((90 - lat!) / 180) * 1024];
  for (const polygon of continents) {
    ctx.beginPath();
    polygon.forEach((point, i) => {
      const [x, y] = xy(point);
      if (i === 0) ctx.moveTo(x!, y!);
      else ctx.lineTo(x!, y!);
    });
    ctx.closePath();
    ctx.fillStyle = '#758976';
    ctx.shadowColor = '#779e99';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
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
  const polar = ctx.createLinearGradient(0, 0, 0, 1024);
  polar.addColorStop(0, 'rgba(225,237,231,.9)');
  polar.addColorStop(0.12, 'rgba(225,237,231,0)');
  polar.addColorStop(0.87, 'rgba(225,237,231,0)');
  polar.addColorStop(1, 'rgba(225,237,231,.9)');
  ctx.fillStyle = polar;
  ctx.fillRect(0, 0, 2048, 1024);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
export function OrbitalBackdrop({ low }: { low: boolean }) {
  const texture = useMemo(earthTexture, []);
  const stars = useMemo(() => {
    const geometry = new BufferGeometry();
    const points: number[] = [];
    for (let i = 0; i < (low ? 180 : 550); i++) {
      const angle = i * 2.399963,
        y = 1 - (2 * (i + 0.5)) / (low ? 180 : 550),
        r = Math.sqrt(1 - y * y);
      points.push(Math.cos(angle) * r * 155, y * 155, Math.sin(angle) * r * 155);
    }
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    return geometry;
  }, [low]);
  useEffect(
    () => () => {
      texture.dispose();
    },
    [texture],
  );
  useEffect(() => () => stars.dispose(), [stars]);
  return (
    <group>
      <points geometry={stars}>
        <pointsMaterial
          color="#a6c8ce"
          size={0.18}
          sizeAttenuation
          transparent
          opacity={0.7}
          fog={false}
        />
      </points>
      <group position={[-9, 10, -52]} rotation={[0.06, 1.6, -0.2]}>
        <mesh>
          <sphereGeometry args={[23, low ? 40 : 72, low ? 24 : 48]} />
          <meshStandardMaterial
            map={texture}
            roughness={1}
            emissive={new Color('#245368')}
            emissiveIntensity={0.12}
          />
        </mesh>
        <mesh scale={1.018}>
          <sphereGeometry args={[23, 40, 28]} />
          <meshBasicMaterial color="#6fc9e1" transparent opacity={0.07} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
