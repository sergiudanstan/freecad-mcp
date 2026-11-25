// Protocol-level tests: start the built server over stdio, talk to it with the MCP
// SDK client. None of these need FreeCAD: they cover tool registration and the
// input validation that runs before any code is sent to FreeCAD.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
let client;

before(async () => {
  client = new Client({ name: 'freecad-mcp-test', version: '0.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry] }));
});

after(async () => {
  await client.close();
});

const text = (res) => res.content.map((c) => c.text).join('\n');

test('registers 165 uniquely named tools, each with an object input schema', async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 165);
  assert.equal(new Set(tools.map((t) => t.name)).size, tools.length);
  for (const t of tools) {
    assert.match(t.name, /^freecad_/);
    assert.ok(t.description, `${t.name} has no description`);
    assert.equal(t.inputSchema.type, 'object', t.name);
  }
});

test('the arbitrary-code tool carries a warning in its description', async () => {
  const { tools } = await client.listTools();
  const t = tools.find((x) => x.name === 'freecad_execute_python');
  assert.ok(t, 'freecad_execute_python missing');
  assert.match(t.description, /arbitrary|security|trusted/i);
});

test('unknown tool names are rejected', async () => {
  const res = await client.callTool({ name: 'freecad_no_such_tool', arguments: {} });
  assert.equal(res.isError, true);
  assert.match(text(res), /Unknown tool/);
});

for (const [label, filePath, pattern] of [
  ['a relative path', 'model.step', /absolute path/],
  ['a path traversal', '/tmp/a/../../etc/passwd', /traversal/],
  ['a blocked system path', '/etc/passwd', /not allowed/],
  ['a path with a null byte', '/tmp/a\0b.step', /null bytes/],
]) {
  test(`freecad_import_step rejects ${label} before touching FreeCAD`, async () => {
    const res = await client.callTool({ name: 'freecad_import_step', arguments: { filePath } });
    assert.equal(res.isError, true);
    assert.match(text(res), pattern);
  });
}

test('numeric tool arguments are range checked before touching FreeCAD', async () => {
  const res = await client.callTool({
    name: 'freecad_create_box',
    arguments: { length: -5, width: 1, height: 1 },
  });
  assert.equal(res.isError, true);
  assert.match(text(res), /Invalid/);
});
