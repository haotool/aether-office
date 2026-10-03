import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'apps/web/public/assets/animals';
const species = ['fox', 'rabbit', 'panda', 'cat', 'dog', 'raccoon', 'otter', 'bear'];
const clips = [
  'idle',
  'walk',
  'turn',
  'sit_down',
  'seated_idle',
  'typing',
  'reading',
  'testing',
  'reviewing',
  'waiting_permission',
  'waiting_peer',
  'celebrate',
  'error',
  'stand_up',
];
const digest = (data) => createHash('sha256').update(data).digest('hex');
const results = [];
for (const name of species) {
  const manifest = JSON.parse(await readFile(`${root}/${name}.json`, 'utf8'));
  assert.equal(
    digest(await readFile(manifest.source)),
    manifest.sourceSha256,
    `${name}: Blender source matches manifest`,
  );
  assert.equal(manifest.uvLayers > 0, true);
  let previous = Infinity;
  for (const level of manifest.lods) {
    const bytes = await readFile(`${root}/${level.file}`);
    assert.equal(digest(bytes), level.sha256, `${level.file}: checksum`);
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const length = bytes.readUInt32LE(12);
    assert.equal(bytes.toString('ascii', 16, 20), 'JSON');
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + length));
    const binaryStart = 20 + length + 8;
    assert.equal(gltf.asset.version, '2.0');
    assert.ok(gltf.skins?.length);
    assert.equal(gltf.materials.length, 1, 'one atlas material per animal');
    assert.deepEqual(gltf.animations.map((a) => a.name).sort(), [...clips].sort());
    for (const socket of manifest.sockets)
      assert.ok(
        gltf.nodes.some((n) => n.name === socket),
        `${name}: ${socket}`,
      );
    for (const image of gltf.images ?? []) {
      assert.ok(Number.isInteger(image.bufferView), 'embedded texture');
      assert.ok(!image.uri, 'no uncontrolled external asset URL');
    }
    let triangles = 0;
    for (const mesh of gltf.meshes)
      for (const primitive of mesh.primitives) {
        for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'])
          assert.ok(
            Number.isInteger(primitive.attributes[attribute]),
            `${level.file}: ${attribute}`,
          );
        const indices = gltf.accessors[primitive.indices];
        triangles += indices.count / 3;
        const position = gltf.accessors[primitive.attributes.POSITION];
        assert.ok(position.min.every(Number.isFinite) && position.max.every(Number.isFinite));
        const weights = gltf.accessors[primitive.attributes.WEIGHTS_0];
        const view = gltf.bufferViews[weights.bufferView];
        const componentSize = { 5126: 4, 5123: 2, 5121: 1 }[weights.componentType];
        assert.ok(componentSize);
        const stride = view.byteStride ?? componentSize * 4;
        for (let i = 0; i < weights.count; i++) {
          let sum = 0;
          for (let j = 0; j < 4; j++) {
            const offset =
              binaryStart +
              (view.byteOffset ?? 0) +
              (weights.byteOffset ?? 0) +
              i * stride +
              j * componentSize;
            const v =
              weights.componentType === 5126
                ? bytes.readFloatLE(offset)
                : weights.componentType === 5123
                  ? bytes.readUInt16LE(offset) / (weights.normalized ? 65535 : 1)
                  : bytes.readUInt8(offset) / (weights.normalized ? 255 : 1);
            assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
            sum += v;
          }
          assert.ok(Math.abs(sum - 1) < 0.005, `${level.file}: normalized skin weight at ${i}`);
        }
      }
    assert.ok(triangles > 0 && triangles < previous, 'LOD triangles strictly decrease');
    previous = triangles;
    assert.equal(triangles, level.triangles, 'manifest triangle count is measured');
    const material = gltf.materials[0];
    assert.ok(
      material.normalTexture &&
        material.occlusionTexture &&
        material.pbrMetallicRoughness.baseColorTexture &&
        material.pbrMetallicRoughness.metallicRoughnessTexture,
    );
    results.push({
      asset: level.file,
      status: 'passed',
      triangles,
      clips: gltf.animations.length,
      bytes: bytes.length,
    });
  }
  for (const texture of manifest.textures)
    assert.equal(digest(await readFile(`${root}/${texture.file}`)), texture.sha256);
}
await writeFile(
  'evidence/assets-validation.json',
  JSON.stringify(
    {
      scope:
        'actual GLB binary, skin weights, rig, clips, UV/PBR and source checksums; visual/animation QA is separate',
      checkedAt: new Date().toISOString(),
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Validated ${results.length} actual GLBs across ${species.length} animal families.`);
