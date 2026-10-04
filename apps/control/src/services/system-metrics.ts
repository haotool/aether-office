import { execFile } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { promisify } from 'node:util';
import { cpus, freemem, homedir, loadavg, totalmem } from 'node:os';

// Machine load and free disk from the standard library (os, fs.statfs): what check-disk-space and systeminformation
// read too, without adding a dependency. CPU use is the share of busy time between two samples.
type Times = { idle: number; total: number };
const sample = (): Times =>
  cpus().reduce(
    (sum, cpu) => {
      const t = cpu.times;
      return {
        idle: sum.idle + t.idle,
        total: sum.total + t.user + t.nice + t.sys + t.idle + t.irq,
      };
    },
    { idle: 0, total: 0 },
  );
let previous: Times = sample();

/**
 * Pure. Memory macOS can hand out without paging: free plus inactive, speculative and purgeable pages (`vm_stat`).
 * `os.freemem()` counts only free pages, so on macOS it reports a near-full machine that is not.
 */
export function availableFromVmStat(text: string): number | null {
  const size = Number(/page size of (\d+) bytes/.exec(text)?.[1]);
  if (!size) return null;
  const pages = (name: string) =>
    Number(new RegExp(`Pages ${name}:\\s+(\\d+)`).exec(text)?.[1] ?? 0);
  return (pages('free') + pages('inactive') + pages('speculative') + pages('purgeable')) * size;
}

async function availableMemory(): Promise<number> {
  if (process.platform !== 'darwin') return freemem();
  try {
    const { stdout } = await promisify(execFile)('vm_stat', [], { timeout: 2000 });
    return availableFromVmStat(stdout) ?? freemem();
  } catch {
    return freemem();
  }
}

/** Pure. Busy share between two cumulative CPU samples, or null when no time has passed. */
export function cpuBusy(before: Times, after: Times): number | null {
  const total = after.total - before.total;
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, (1 - (after.idle - before.idle) / total) * 100));
}

export async function systemMetrics(paths: readonly string[] = [homedir()]) {
  const now = sample();
  const busy = cpuBusy(previous, now);
  previous = now;
  const seen = new Set<string>();
  const disks = [];
  for (const path of paths) {
    try {
      const fs = await statfs(path);
      const total = fs.blocks * fs.bsize;
      const free = fs.bavail * fs.bsize;
      const key = `${total}:${fs.type}`; // the same volume reached by two paths is listed once
      if (seen.has(key)) continue;
      seen.add(key);
      disks.push({ path, totalBytes: total, freeBytes: free });
    } catch {
      /* a path that is gone is simply not reported */
    }
  }
  return {
    cpu: { cores: cpus().length, busyPercent: busy, loadAverage: loadavg() },
    memory: { totalBytes: totalmem(), freeBytes: await availableMemory() },
    disks,
  };
}
