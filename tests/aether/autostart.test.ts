import { expect, it } from 'vitest';
import { plist } from '../../scripts/autostart.js';

const service = { node: '/bin/node', root: '/a&b/app', data: '/a&b/data', host: '127.0.0.1' };

it('renders a launchd plist that escapes paths and keeps the host local unless asked', () => {
  const text = plist(service);
  expect(text).toContain('<string>/a&amp;b/app</string>');
  expect(text).toContain('<key>AETHER_HOST</key><string>127.0.0.1</string>');
  expect(plist({ ...service, host: '0.0.0.0' })).toContain('<string>0.0.0.0</string>');
});
