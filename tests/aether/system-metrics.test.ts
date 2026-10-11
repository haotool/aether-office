import { expect, it } from 'vitest';
import {
  availableFromVmStat,
  cpuBusy,
  systemMetrics,
} from '../../apps/control/src/services/platform/system-metrics.js';

it('computes CPU busy share between samples and reads real memory and disk', async () => {
  expect(cpuBusy({ idle: 100, total: 200 }, { idle: 150, total: 300 })).toBe(50);
  expect(cpuBusy({ idle: 1, total: 1 }, { idle: 1, total: 1 })).toBeNull();
  const m = await systemMetrics([process.cwd(), process.cwd()]);
  expect(m.cpu.cores).toBeGreaterThan(0);
  expect(m.memory.totalBytes).toBeGreaterThan(m.memory.freeBytes);
  expect(m.disks).toHaveLength(1);
  expect(m.disks[0]!.totalBytes).toBeGreaterThan(m.disks[0]!.freeBytes);
});

it('counts reclaimable pages as available memory on macOS', () => {
  const vm =
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:  100.\nPages active:  900.\nPages inactive:  50.\nPages speculative:  10.\nPages wired down: 5.\nPages purgeable:  2.\n';
  expect(availableFromVmStat(vm)).toBe((100 + 50 + 10 + 2) * 16384);
  expect(availableFromVmStat('garbage')).toBeNull();
});
