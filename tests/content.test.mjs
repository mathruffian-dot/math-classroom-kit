import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function files(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.wrangler', 'dist', 'artifacts', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const p = join(dir, entry.name);
    output.push(...(entry.isDirectory() ? await files(p) : [p]));
  }
  return output;
}

test('public source contains no credential files or apparent hard-coded provider keys', async () => {
  const candidates = await files(root);
  for (const file of candidates) {
    const relative = file.slice(root.length + 1).replaceAll('\\', '/');
    // A developer may have local runtime secrets; .gitignore must exclude them.
    if (/^(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?)$/.test(relative) && !relative.endsWith('.example')) continue;
    if (!['.ts', '.js', '.mjs', '.json', '.md', '.html', '.yml', '.yaml', '.toml', '.sql'].includes(extname(file))) continue;
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{28,}\b/, `Possible provider key in ${relative}`);
    assert.doesNotMatch(source, /\bsbp_[A-Za-z0-9]{28,}\b/, `Possible Supabase access token in ${relative}`);
    assert.doesNotMatch(source, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, `Private key in ${relative}`);
  }
  const ignored = await readFile(join(root, '.gitignore'), 'utf8');
  for (const required of ['.dev.vars', '.env', '.wrangler/', 'artifacts/', 'test-results/']) assert.ok(ignored.split(/\r?\n/).includes(required), `${required} must remain ignored`);
});

test('example lessons have unique stable IDs and valid activity options', async () => {
  const allFiles = await files(join(root, 'content'));
  const lessons = [];
  for (const file of allFiles.filter(f => f.endsWith('.json'))) {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (value.schemaVersion === 1 && Array.isArray(value.slides)) lessons.push(value);
  }
  assert.ok(lessons.length > 0, 'Provide at least one editable lesson JSON example');
  for (const lesson of lessons) {
    assert.ok(lesson.title && lesson.description && lesson.objectives.length);
    assert.ok(lesson.slides.length >= 3, `${lesson.id}: show several different slide examples`);
    const ids = lesson.slides.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length, 'Slide IDs must be unique');
    // 每一頁都要有依該頁內容設計的 IRS。
    for (const s of lesson.slides) assert.ok(s.activity, `${lesson.id}/${s.id}: every slide needs an IRS activity`);
    const activities = lesson.slides.flatMap(s => s.activity ? [s.activity] : []);
    assert.equal(new Set(activities.map(a => a.id)).size, activities.length, 'Activity IDs must be unique');
    for (const activity of activities) {
      assert.ok(activity.prompt);
      assert.ok(['single', 'multiple', 'scale', 'short', 'numeric', 'canvas', 'manipulate'].includes(activity.type));
      if (activity.type === 'canvas') assert.ok(activity.rubric?.criteria?.length, `${activity.id}: canvas needs a rubric`);
      if (activity.type === 'numeric') assert.ok(activity.answer || activity.items?.length, `${activity.id}: numeric needs an answer or items`);
      if (activity.type === 'manipulate') assert.ok(activity.check, `${activity.id}: manipulate needs a check`);
      if (['single', 'multiple'].includes(activity.type)) {
        assert.ok(activity.options.length >= 2);
        assert.equal(new Set(activity.options).size, activity.options.length);
        for (const index of activity.correct || []) assert.ok(Number.isInteger(index) && index >= 0 && index < activity.options.length);
      }
      if (activity.type === 'scale') assert.ok(Number.isFinite(activity.min) && Number.isFinite(activity.max) && activity.max > activity.min);
    }
  }
});
