import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('..', import.meta.url));
const json = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const p = json('.codex-plugin/plugin.json');
const allow = ['name', 'version', 'description', 'author', 'skills', 'mcpServers', 'interface'];
assert.ok(Object.keys(p).every(k => allow.includes(k)));
assert.equal(p.name, path.basename(root)); assert.match(p.name, /^[a-z][a-z0-9-]*$/); assert.match(p.version, /^\d+\.\d+\.\d+$/);
for (const value of [p.description, p.author.name, ...['displayName', 'shortDescription', 'longDescription', 'developerName', 'category'].map(k => p.interface[k])]) assert.ok(typeof value === 'string' && value.trim());
assert.ok(Array.isArray(p.interface.capabilities) && p.interface.capabilities.every(v => typeof v === 'string'));
assert.ok(Array.isArray(p.interface.defaultPrompt) && p.interface.defaultPrompt.length <= 3 && p.interface.defaultPrompt.every(v => typeof v === 'string' && v.length <= 128));
assert.ok(!JSON.stringify(p).includes('[TODO:'));
assert.equal(p.skills, './skills/'); assert.equal(p.mcpServers, './.mcp.json');
const skill = fs.readFileSync(path.join(root, 'skills/threadfold/SKILL.md'), 'utf8');
assert.match(skill, /^---\nname: threadfold\ndescription: [^\n]+\n---\n/);
const mcp = json('.mcp.json'); assert.deepEqual(Object.keys(mcp), ['mcpServers']);
const entry = mcp.mcpServers.threadfold; assert.equal(entry.command, './bin/launch-mcp'); assert.equal(entry.cwd, '.');
assert.ok(fs.statSync(path.join(root, entry.command)).mode & 0o111);
assert.equal(json('package.json').bin.threadfold, './bin/threadfold.js');
for (const [name, expected] of Object.entries(json('docs/SOURCE_HASHES.json'))) {
  const actual = createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex'); assert.equal(actual, expected, `Source changed: ${name}`);
}
console.log('PASS local package checks: manifest, companion MCP, launcher, skill metadata, source hashes');
console.log('Scope: repository-local validation only; official Python validator and live host loading are separate checks.');
