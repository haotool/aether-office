import { realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  CodexObserver,
  discoverObservationFiles,
  observeClaudeFile,
  type ObservationRead,
} from './observer.js';
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
      if (
        realpathSync(profile.approvedRoot) !== profile.approvedRoot ||
        realpathSync(profile.projectRoot) !== profile.projectRoot
      )
        throw new Error('OBSERVATION_PATH_CHANGED');
      const scope = digest(
        JSON.stringify([
          profile.projectId,
          profile.agentId,
          profile.provider,
          profile.projectRoot,
          profile.approvedRoot,
        ]),
      );
      const files = new Set(profile.files);
      if (profile.discover) {
        for (const file of discoverObservationFiles(profile.approvedRoot)) files.add(file);
        for (const entry of Object.values(this.journal.state.observers))
          if (entry.scope === scope) files.add(entry.file);
      }
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
  async tick() {
    if (this.stopped || this.now() < this.nextPoll) return;
    this.nextPoll = this.now() + 1000;
    let discoveryError: unknown;
    if (this.now() >= this.nextDiscovery) {
      this.nextDiscovery = this.now() + 5000;
      try {
        this.refresh();
      } catch (error) {
        discoveryError = error;
      }
    }
    const sources = [...this.sources.values()];
    if (!sources.length) {
      if (discoveryError) throw discoveryError;
      return;
    }
    const source = sources[this.index++ % sources.length]!;
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
    let status: ObservationRead['status'],
      records: ObservationRead['records'],
      checkpoint = prior.checkpoint,
      fingerprint = prior.fingerprint;
    try {
      if (
        realpathSync(source.profile.approvedRoot) !== source.profile.approvedRoot ||
        realpathSync(source.profile.projectRoot) !== source.profile.projectRoot
      )
        throw new Error('OBSERVATION_PATH_CHANGED');
      if (source.profile.provider === 'codex') {
        const read = new CodexObserver(
          source.profile.approvedRoot,
          source.file,
          source.profile.projectRoot,
        ).read(prior.checkpoint);
        status = read.status;
        records = read.records;
        checkpoint = read.checkpoint;
      } else {
        const read = await observeClaudeFile(
          source.profile.approvedRoot,
          source.file,
          source.profile.projectRoot,
        );
        status = read.status;
        records = read.fingerprint === prior.fingerprint ? [] : read.records;
        fingerprint = read.fingerprint;
      }
    } catch (error) {
      status =
        (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'missing'
          : error instanceof Error && error.message === 'OBSERVATION_PATH_CHANGED'
            ? 'blocked_path'
            : 'read_error';
      records = [];
    }
    records = records.filter((r) => !prior.seen.includes(r.sourceId));
    const next: ObserverJournal = {
      ...prior,
      checkpoint,
      fingerprint,
      status,
      seen: [...prior.seen, ...records.map((r) => r.sourceId)].slice(-256),
      pending: [],
    };
    if (records.length || status !== prior.status || this.now() - prior.lastReportedAt >= 15000) {
      const batches: (typeof records)[] = [[]];
      let bytes = 0;
      for (const record of records) {
        const length = Buffer.byteLength(JSON.stringify(record));
        if (batches.at(-1)!.length === 4 || bytes + length > 100000) {
          batches.push([]);
          bytes = 0;
        }
        batches.at(-1)!.push(record);
        bytes += length;
      }
      for (const records of batches) {
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
          records,
        };
        next.pending.push(report);
      }
      next.lastReportedAt = this.now();
    }
    // Cursor and every unsent record are committed together; a failed save rolls back both in memory.
    this.save(source.key, next);
    await this.flush(source);
    if (discoveryError) throw discoveryError;
  }
}
