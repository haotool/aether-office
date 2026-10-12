import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Keeps only the keyframes that linear interpolation cannot stand in for (within 1 mm, 0.11 degrees), always the first
 * and last so a loop keeps its length and seam, and rewrites the manifests. Run it after
 * tools/blender/build_animals.py; running it again changes nothing.
 */
const DIR = 'apps/web/public/assets/animals';
const TOLERANCE = { translation: 0.001, rotation: 0.002, scale: 0.001 };
const COMPONENTS = { SCALAR: 1, VEC3: 3, VEC4: 4 };

function parseGlb(buffer) {
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  return { json, bin: buffer.subarray(binStart, binStart + buffer.readUInt32LE(20 + jsonLength)) };
}
function writeGlb(json, bin) {
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const body = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const out = Buffer.alloc(12 + 8 + text.length + 8 + body.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(text.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  text.copy(out, 20);
  out.writeUInt32LE(body.length, 20 + text.length);
  out.writeUInt32LE(0x004e4942, 24 + text.length);
  body.copy(out, 28 + text.length);
  return out;
}
const readFloats = (json, bin, accessor) => {
  const a = json.accessors[accessor];
  const view = json.bufferViews[a.bufferView];
  const n = COMPONENTS[a.type];
  const out = new Float32Array(a.count * n);
  const base = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  for (let i = 0; i < out.length; i++) out[i] = bin.readFloatLE(base + i * 4);
  return out;
};

function error(times, values, n, path, a, b, i) {
  const t = (times[i] - times[a]) / (times[b] - times[a]);
  if (path === 'rotation') {
    const q = [0, 1, 2, 3].map(
      (k) => values[a * 4 + k] + (values[b * 4 + k] - values[a * 4 + k]) * t,
    );
    const norm = Math.hypot(...q) || 1;
    const dot = Math.abs([0, 1, 2, 3].reduce((s, k) => s + (q[k] / norm) * values[i * 4 + k], 0));
    return 2 * Math.acos(Math.min(1, dot));
  }
  let worst = 0;
  for (let k = 0; k < n; k++)
    worst = Math.max(
      worst,
      Math.abs(values[a * n + k] + (values[b * n + k] - values[a * n + k]) * t - values[i * n + k]),
    );
  return worst;
}

function keep(times, values, path) {
  const n = COMPONENTS[path === 'rotation' ? 'VEC4' : 'VEC3'];
  const kept = new Set([0, times.length - 1]);
  const tolerance = TOLERANCE[path];
  const split = (a, b) => {
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const e = error(times, values, n, path, a, b, i);
      if (e > worst) [worst, at] = [e, i];
    }
    if (worst > tolerance) {
      kept.add(at);
      split(a, at);
      split(at, b);
    }
  };
  split(0, times.length - 1);
  return [...kept].sort((x, y) => x - y);
}

function sample(times, values, n, path, t) {
  const last = times.length - 1;
  if (t <= times[0]) return Array.from(values.subarray(0, n));
  if (t >= times[last]) return Array.from(values.subarray(last * n, last * n + n));
  let i = 0;
  while (times[i + 1] < t) i++;
  const k = (t - times[i]) / (times[i + 1] - times[i]);
  const out = Array.from(
    { length: n },
    (_, c) => values[i * n + c] + (values[(i + 1) * n + c] - values[i * n + c]) * k,
  );
  if (path !== 'rotation') return out;
  const norm = Math.hypot(...out) || 1;
  return out.map((v) => v / norm);
}
const angle = (a, b) =>
  2 * Math.acos(Math.min(1, Math.abs(a.reduce((s, v, i) => s + v * b[i], 0))));

function reduce(json, bin) {
  // Every sampler gets its own, new time and value accessors: the exporter shares one time accessor between all the
  // channels of a clip, and each channel keeps different keys.
  const fresh = [];
  const original = json.accessors.length;
  const made = (type, data) => {
    fresh.push({ type, data });
    return original + fresh.length - 1;
  };
  const checks = [];
  for (const animation of json.animations ?? []) {
    animation.samplers.forEach((sampler, si) => {
      if ((sampler.interpolation ?? 'LINEAR') !== 'LINEAR') return;
      const channel = animation.channels.find((c) => c.sampler === si);
      const path = channel?.target.path;
      if (!path || !(path in TOLERANCE)) return;
      const times = readFloats(json, bin, sampler.input);
      const values = readFloats(json, bin, sampler.output);
      const type = json.accessors[sampler.output].type;
      const n = COMPONENTS[type];
      const kept = times.length > 2 ? keep(times, values, path) : [0, times.length - 1];
      const keptTimes = Float32Array.from(kept, (i) => times[i]);
      const keptValues = Float32Array.from(
        kept.flatMap((i) => [...values.subarray(i * n, i * n + n)]),
      );
      checks.push({ times, values, keptTimes, keptValues, n, path });
      sampler.input = made('SCALAR', keptTimes);
      sampler.output = made(type, keptValues);
    });
  }
  // The reduced tracks must say what the originals said, at every original key.
  for (const c of checks)
    for (let i = 0; i < c.times.length; i++) {
      const was = Array.from(c.values.subarray(i * c.n, i * c.n + c.n));
      const now = sample(c.keptTimes, c.keptValues, c.n, c.path, c.times[i]);
      const off =
        c.path === 'rotation'
          ? angle(was, now)
          : Math.max(...was.map((v, k) => Math.abs(v - now[k])));
      if (off > TOLERANCE[c.path] * 1.5) throw new Error(`a ${c.path} track drifted by ${off}`);
    }

  const stale = new Set();
  const referenced = new Set();
  const mark = (index) => index !== undefined && referenced.add(index);
  json.meshes?.forEach((m) =>
    m.primitives.forEach((p) => {
      Object.values(p.attributes).forEach(mark);
      mark(p.indices);
      p.targets?.forEach((t) => Object.values(t).forEach(mark));
    }),
  );
  json.skins?.forEach((s) => mark(s.inverseBindMatrices));
  json.animations?.forEach((a) => a.samplers.forEach((s) => (mark(s.input), mark(s.output))));
  json.accessors.forEach((_, i) => !referenced.has(i) && i < original && stale.add(i));

  const chunks = [];
  let offset = 0;
  const push = (data) => {
    const start = offset;
    const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
    chunks.push(padded);
    offset += padded.length;
    return start;
  };
  const viewOf = new Map();
  const views = [];
  const keepView = (index) => {
    if (viewOf.has(index)) return viewOf.get(index);
    const view = json.bufferViews[index];
    const start = view.byteOffset ?? 0;
    views.push({ ...view, byteOffset: push(bin.subarray(start, start + view.byteLength)) });
    viewOf.set(index, views.length - 1);
    return views.length - 1;
  };
  const accessors = [];
  const accessorOf = new Map();
  json.accessors.forEach((a, i) => {
    if (stale.has(i)) return;
    accessorOf.set(i, accessors.length);
    accessors.push(a.bufferView === undefined ? a : { ...a, bufferView: keepView(a.bufferView) });
  });
  json.images?.forEach(
    (image) => image.bufferView !== undefined && (image.bufferView = keepView(image.bufferView)),
  );
  fresh.forEach(({ type, data }, i) => {
    const bytes = Buffer.from(data.buffer);
    const accessor = {
      bufferView: views.length,
      componentType: 5126,
      count: data.length / COMPONENTS[type],
      type,
    };
    if (type === 'SCALAR')
      Object.assign(accessor, { min: [data[0]], max: [data[data.length - 1]] });
    views.push({ buffer: 0, byteOffset: push(bytes), byteLength: bytes.length });
    accessorOf.set(original + i, accessors.length);
    accessors.push(accessor);
  });
  const re = (index) => (index === undefined ? undefined : accessorOf.get(index));
  json.meshes?.forEach((m) =>
    m.primitives.forEach((p) => {
      for (const key of Object.keys(p.attributes)) p.attributes[key] = re(p.attributes[key]);
      if (p.indices !== undefined) p.indices = re(p.indices);
      p.targets?.forEach((t) => Object.keys(t).forEach((key) => (t[key] = re(t[key]))));
    }),
  );
  json.skins?.forEach(
    (s) =>
      s.inverseBindMatrices !== undefined && (s.inverseBindMatrices = re(s.inverseBindMatrices)),
  );
  json.animations?.forEach((a) =>
    a.samplers.forEach((s) => ((s.input = re(s.input)), (s.output = re(s.output)))),
  );
  json.accessors = accessors;
  json.bufferViews = views;
  json.buffers[0].byteLength = offset;
  return Buffer.concat(chunks);
}

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
let before = 0;
let after = 0;
for (const manifestFile of (await readdir(DIR)).filter((f) => f.endsWith('.json'))) {
  const manifest = JSON.parse(await readFile(join(DIR, manifestFile), 'utf8'));
  if (manifest.animationReduced) continue; // reducing twice would let the error add up
  for (const lod of manifest.lods) {
    const original = await readFile(join(DIR, lod.file));
    const { json, bin } = parseGlb(original);
    const next = writeGlb(json, reduce(json, bin));
    before += original.length;
    after += Math.min(original.length, next.length);
    if (next.length >= original.length) continue;
    await writeFile(join(DIR, lod.file), next);
    lod.sha256 = sha(next);
    lod.bytes = next.length;
  }
  manifest.animationReduced = { tolerance: TOLERANCE };
  await writeFile(join(DIR, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(
  `animals: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB (raw, before compression)`,
);
