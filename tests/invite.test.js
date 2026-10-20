import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CODE, cleanCode, inviteHash, parseInvite, qrSvg } from '../js/invite.js';

test('invite links carry a friend code and a display name, nothing else', () => {
  assert.deepEqual(parseInvite('k7qm-4xrt', 'Neil'), { code: 'K7QM4XRT', name: 'Neil' });
  assert.deepEqual(parseInvite('K7QM4XRT', 'Ana%20Ruiz'), { code: 'K7QM4XRT', name: 'Ana Ruiz' });
  assert.equal(parseInvite('K7QM4XRT', undefined).name, '');
  // Names can't carry markup or be very long; bad encodings don't crash.
  assert.equal(parseInvite('K7QM4XRT', '%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E').name, 'img srcx onerroralert1');
  assert.equal(parseInvite('K7QM4XRT', 'x'.repeat(80)).name.length, 30);
  assert.equal(parseInvite('K7QM4XRT', '%E0%A4%A').name, '');
  assert.equal(inviteHash({ code: 'K7QM4XRT', name: 'Ana Ruiz' }), '#/add/K7QM4XRT/Ana%20Ruiz');
});

test('only real friend codes count', () => {
  assert.ok(CODE.test(cleanCode('k7qm-4xrt')));
  for (const bad of ['NOTACODE', 'K7QM4XR', 'K7QM4XRT1', 'K0QM4XRT', 'K1QM4XRT']) assert.ok(!CODE.test(cleanCode(bad)), bad);
});

test('the QR code is an SVG square with dark modules', () => {
  const svg = qrSvg('https://legoneil.github.io/rotation-planner/#/add/K7QM4XRT/Neil');
  assert.match(svg, /^<svg class="qr" viewBox="-4 -4 (\d+) \1"/);
  assert.ok((svg.match(/h1v1h-1z/g) ?? []).length > 300);
});
