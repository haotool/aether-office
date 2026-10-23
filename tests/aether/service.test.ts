import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  LABEL,
  installService,
  restartService,
  servicePaths,
  servicePlist,
  uninstallService,
  type Launchctl,
} from '../../scripts/service.js';

const home = () => mkdtempSync(join(tmpdir(), 'aether-service-'));
const calls: string[][] = [];
const launchctl =
  (status = 0): Launchctl =>
  (args) => {
    calls.push(args);
    return { status, output: status ? 'Bootstrap failed: 5: Input/output error' : '' };
  };
const context = (over: Partial<Parameters<typeof installService>[0]> = {}) => ({
  root: '/work/aether',
  node: '/opt/node-24/bin/node',
  env: { PATH: '/opt/node-24/bin:/usr/bin', PORT: '4400', AETHER_HOST: '0.0.0.0', SECRET: 'no' },
  home: home(),
  uid: 501,
  launchctl: launchctl(),
  ...over,
});

it('pins the node that ran the install, the checkout, the chosen settings, a throttle and one log file', () => {
  const c = context();
  const plist = servicePlist(c);
  const { log } = servicePaths(c.home);
  for (const expected of [
    `<key>Label</key><string>${LABEL}</string>`,
    '<string>/opt/node-24/bin/node</string><string>/work/aether/apps/control/dist/main.js</string>',
    '<key>WorkingDirectory</key><string>/work/aether</string>',
    '<key>PATH</key><string>/opt/node-24/bin:/usr/bin</string>',
    '<key>PORT</key><string>4400</string>',
    '<key>AETHER_HOST</key><string>0.0.0.0</string>',
    `<key>AETHER_LOG_FILE</key><string>${log}</string>`,
    '<key>KeepAlive</key><true/>',
    '<key>RunAtLoad</key><true/>',
    '<key>ThrottleInterval</key><integer>30</integer>',
    `<key>StandardOutPath</key><string>${log}</string>`,
    `<key>StandardErrorPath</key><string>${log}</string>`,
  ])
    expect(plist, expected).toContain(expected);
  expect(plist).not.toContain('SECRET');
});

it('escapes what XML reserves in a path', () => {
  expect(servicePlist(context({ root: '/work/a&b<c>' }))).toContain('/work/a&amp;b&lt;c&gt;');
});

it.runIf(process.platform === 'darwin')('writes a property list that plutil accepts', () => {
  const c = context({ env: { PATH: '/usr/bin' } });
  installService(c);
  const run = spawnSync('plutil', ['-lint', servicePaths(c.home).plist], { encoding: 'utf8' });
  expect(run.status, run.stdout + run.stderr).toBe(0);
});

it('installs by replacing any loaded copy and loading the new plist', () => {
  calls.length = 0;
  const c = context();
  installService(c);
  expect(readFileSync(servicePaths(c.home).plist, 'utf8')).toContain(LABEL);
  expect(calls).toEqual([
    ['bootout', `gui/501/${LABEL}`],
    ['bootstrap', 'gui/501', servicePaths(c.home).plist],
  ]);
});

it('says what launchctl refused instead of reporting success', () => {
  expect(() => installService(context({ launchctl: launchctl(5) }))).toThrow(
    'Bootstrap failed: 5: Input/output error',
  );
});

it('uninstalls by unloading and deleting the plist, and does nothing when there is none', () => {
  const c = context();
  installService(c);
  calls.length = 0;
  uninstallService(c);
  expect(existsSync(servicePaths(c.home).plist)).toBe(false);
  expect(calls).toEqual([['bootout', `gui/501/${LABEL}`]]);
  expect(() => uninstallService(c)).not.toThrow();
});

it('restarts only a service installed from this checkout', () => {
  const c = context();
  expect(restartService(c)).toBe('absent');
  installService(c);
  calls.length = 0;
  expect(restartService({ ...c, root: '/work/other' })).toBe('absent');
  expect(calls).toEqual([]);
  expect(restartService(c)).toBe('restarted');
  expect(calls).toEqual([['kickstart', '-k', `gui/501/${LABEL}`]]);
  expect(restartService({ ...c, launchctl: launchctl(113) })).toBe('failed');
});
