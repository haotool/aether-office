import { readFile, writeFile, mkdir } from 'node:fs/promises';

const requested = process.argv.slice(2);
const packages = requested.length
  ? requested
  : Object.keys(JSON.parse(await readFile('package.json', 'utf8')).devDependencies ?? {});
const checkedAt = new Date().toISOString();
const records = [];
for (let start = 0; start < packages.length; start += 6) {
  records.push(
    ...(await Promise.all(
      packages.slice(start, start + 6).map(async (name) => {
        const source = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
        const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`${name}: registry HTTP ${response.status}`);
        const metadata = await response.json();
        const selected = metadata['dist-tags'].latest;
        if (!/^\d+\.\d+\.\d+$/.test(selected))
          throw new Error(`${name}: latest is not stable: ${selected}`);
        const version = metadata.versions[selected];
        return {
          package: name,
          requested: 'latest compatible stable',
          selected,
          latestStable: selected,
          engines: version.engines ?? {},
          peers: version.peerDependencies ?? {},
          peerMeta: version.peerDependenciesMeta ?? {},
          license: version.license,
          scripts: version.scripts ?? {},
          nativeBuildRequirements: version.gypfile ? 'node-gyp toolchain' : null,
          source,
          checkedAt,
          exceptionReason: null,
        };
      }),
    )),
  );
}
await mkdir('evidence', { recursive: true });
let previous = [];
try {
  previous = JSON.parse(await readFile('evidence/dependency-registry.json', 'utf8')).registry;
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const merged = new Map(previous.map((record) => [record.package, record]));
for (const record of records) merged.set(record.package, record);
await writeFile(
  'evidence/dependency-registry.json',
  JSON.stringify({ checkedAt, node: process.version, registry: [...merged.values()] }, null, 2) +
    '\n',
);
for (const r of records) console.log(`${r.package}@${r.selected} ${JSON.stringify(r.peers)}`);
