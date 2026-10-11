import { realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { CodexObserver, observeClaudeFile, type ObservationRead } from './observer.js';
import { discoverObservationFiles } from './observer-source.js';
import { digest } from './workspaces.js';
import type { Journal, ObserverJournal } from './journal.js';
import type { NativeExecutor, ObservationProfile } from './native.js';
import type { ObservationReport } from '@aether/contracts';
type Source = {
  key: string;
  scope: string;
  file: string;
  name: string;
  profile: ObservationProfile;
};

function assertObservationRootsStable(profile: ObservationProfile) {
  if (
    realpathSync(profile.approvedRoot) !== profile.approvedRoot ||
    realpathSync(profile.projectRoot) !== profile.projectRoot
  )
    throw new Error('OBSERVATION_PATH_CHANGED');
}

function observationScope(profile: ObservationProfile) {
  return digest(
    JSON.stringify([
      profile.projectId,
      profile.agentId,
      profile.provider,
      profile.projectRoot,
      profile.approvedRoot,
    ]),
  );
}

function observationFilesFor(profile: ObservationProfile, journal: Journal, scope: string) {
  const files = new Set(profile.files);
  if (!profile.discover) return files;
  for (const file of discoverObservationFiles(profile.approvedRoot)) files.add(file);
  for (const entry of Object.values(journal.state.observers))
    if (entry.scope === scope) files.add(entry.file);
  return files;
}

export class ObserverRunner {
  private stopped = false;
  stop() {
    this.stopped = true;
  }
  private sources = new Map<string, Source>();
  private index = 0;
  private nextPoll = 0;
  private nextDiscovery = 0;
  private refresh() {
    for (const [name, profile] of this.native.observationProfiles) {
      assertObservationRootsStable(profile);
      const scope = observationScope(profile);
      const files = observationFilesFor(profile, this.journal, scope);
      if (files.size > 64) throw new Error('OBSERVATION_FILE_LIMIT');
      for (const file of files) {
        const key = digest(scope + ':' + file);
        this.sources.set(key, { key, scope, file, name, profile });
      }
    }
  }
  constructor(
    private journal: Journal,
    private native: NativeExecutor,
    private api: (path: string, body: unknown) => Promise<unknown>,
    private now: () => number = Date.now,
  ) {}
  private save(key: string, next: ObserverJournal) {
    const prior = this.journal.state.observers[key];
    this.journal.state.observers[key] = next;
    try {
      this.journal.save();
    } catch (error) {
      if (prior) this.journal.state.observers[key] = prior;
      else delete this.journal.state.observers[key];
      throw error;
    }
  }
  private async flush(source: Source) {
    const entry = this.journal.state.observers[source.key];
    if (!entry) return;
    for (let count = 0; !this.stopped && entry.pending.length && count < 4; count++) {
      await this.api('/api/runner/observations', entry.pending[0]);
      entry.pending.shift();
      this.journal.save();
    }
  }
  private discover(): unknown {
    if (this.now() < this.nextDiscovery) return undefined;
    this.nextDiscovery = this.now() + 5000;
    try {
      this.refresh();
      return undefined;
    } catch (error) {
      return error;
    }
  }
  private async readSource(source: Source, prior: ObserverJournal) {
    let checkpoint = prior.checkpoint,
      fingerprint = prior.fingerprint;
    try {
      if (
        realpathSync(source.profile.approvedRoot) !== source.profile.approvedRoot ||
        realpathSync(source.profile.projectRoot) !== source.profile.projectRoot
      )
        throw new Error('OBSERVATION_PATH_CHANGED');
      const { approvedRoot, projectRoot, provider } = source.profile;
      if (provider === 'codex') {
        const read = new CodexObserver(approvedRoot, source.file, projectRoot).read(
          prior.checkpoint,
        );
        return {
          status: read.status,
          records: read.records,
          checkpoint: read.checkpoint,
          fingerprint,
        };
      }
      const read = await observeClaudeFile(approvedRoot, source.file, projectRoot);
      return {
        status: read.status,
        records: read.fingerprint === prior.fingerprint ? [] : read.records,
        checkpoint,
        fingerprint: read.fingerprint,
      };
    } catch (error) {
      const status: ObservationRead['status'] =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'missing'
          : error instanceof Error && error.message === 'OBSERVATION_PATH_CHANGED'
            ? 'blocked_path'
            : 'read_error';
      return { status, records: [], checkpoint, fingerprint };
    }
  }
  /** Splits records into reports of at most four records and 100 kB each, so none exceeds the HTTP envelope. */
  private batches(records: ObservationRead['records']) {
    const batches: ObservationRead['records'][] = [[]];
    let bytes = 0;
    for (const record of records) {
      const length = Buffer.byteLength(JSON.stringify(record));
      let batch = batches.at(-1) ?? [];
      if (batch.length === 4 || bytes + length > 100000) {
        batch = [];
        batches.push(batch);
        bytes = 0;
      }
      batch.push(record);
      bytes += length;
    }
    return batches;
  }
  private queueReports(
    source: Source,
    prior: ObserverJournal,
    next: ObserverJournal,
    status: ObservationRead['status'],
    records: ObservationRead['records'],
  ) {
    if (!records.length && status === prior.status && this.now() - prior.lastReportedAt < 15000)
      return;
    for (const batch of this.batches(records)) {
      const report: ObservationReport = {
        reportId: randomUUID(),
        projectId: source.profile.projectId,
        agentId: source.profile.agentId,
        projectRoot: source.profile.projectRoot,
        provider: source.profile.provider,
        sourceKey: source.key,
        label: `${source.name} · ${source.file}`.slice(0, 160),
        revision: ++next.revision,
        status,
        records: batch,
      };
      next.pending.push(report);
    }
    next.lastReportedAt = this.now();
  }
  async tick() {
    if (this.stopped || this.now() < this.nextPoll) return;
    this.nextPoll = this.now() + 1000;
    const discoveryError = this.discover();
    const sources = [...this.sources.values()];
    const source = sources.length ? sources[this.index++ % sources.length] : undefined;
    if (!source) {
      if (discoveryError) throw discoveryError;
      return;
    }
    await this.flush(source);
    if (this.stopped) return;
    const current = this.journal.state.observers[source.key];
    if (current?.pending.length) return;
    const prior = current ?? {
      scope: source.scope,
      file: source.file,
      checkpoint: null,
      fingerprint: null,
      revision: 0,
      lastReportedAt: 0,
      status: '',
      seen: [],
      pending: [],
    };
    const read = await this.readSource(source, prior);
    const records = read.records.filter((r) => !prior.seen.includes(r.sourceId));
    const next: ObserverJournal = {
      ...prior,
      checkpoint: read.checkpoint,
      fingerprint: read.fingerprint,
      status: read.status,
      seen: [...prior.seen, ...records.map((r) => r.sourceId)].slice(-256),
      pending: [],
    };
    this.queueReports(source, prior, next, read.status, records);
    this.save(source.key, next);
    await this.flush(source);
    if (discoveryError) throw discoveryError;
  }
}
