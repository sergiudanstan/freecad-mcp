import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFreecadCmd, MACOS_FREECAD_CMD } from '../dist/freecad-cmd.js';

const MAC = '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd';
const only = (...paths) => (p) => paths.includes(p);

test('macOS default path is unchanged', () => {
  assert.equal(MACOS_FREECAD_CMD, MAC);
});

test('FREECAD_CMD wins over PATH', () => {
  const env = { FREECAD_CMD: '/opt/fc/freecadcmd', PATH: '/usr/bin' };
  assert.equal(resolveFreecadCmd(env, only('/usr/bin/freecadcmd')), '/opt/fc/freecadcmd');
});

test('falls back to freecadcmd on PATH, first match wins', () => {
  const env = { PATH: '/a:/usr/bin:/b' };
  assert.equal(resolveFreecadCmd(env, only('/usr/bin/freecadcmd', '/b/freecadcmd')), '/usr/bin/freecadcmd');
});

test('falls back to the macOS path when nothing else is found', () => {
  assert.equal(resolveFreecadCmd({ PATH: '/a:/b' }, () => false), MAC);
  assert.equal(resolveFreecadCmd({}, () => false), MAC);
});
