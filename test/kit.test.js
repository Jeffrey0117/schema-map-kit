'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const kit = require('../index');
const { main, parseArgs } = require('../cli');
const { readEnvFile, pickEnv } = require('../lib/env');

const OPENAPI = {
  definitions: {
    lessons: {
      required: ['id', 'course_id', 'title'],
      properties: {
        id: { format: 'uuid', type: 'string', description: 'Note:\nThis is a Primary Key.<pk/>' },
        course_id: {
          format: 'uuid',
          type: 'string',
          description: "Note:\nThis is a Foreign Key to `courses.id`.<fk table='courses' column='id'/>",
        },
        title: { format: 'text', type: 'string' },
        duration: { format: 'integer', type: 'integer' },
        tags: { format: 'text[]', type: 'array' },
        meta: { format: 'jsonb' },
        level: { format: 'public.level', type: 'string', enum: ['easy', 'hard'] },
      },
    },
    courses: { required: ['id'], properties: { id: { format: 'uuid', description: '<pk/>' } } },
  },
};

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'schema-map-kit-'));
}

function makeSqlite(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255) NOT NULL, role TEXT, prefs TEXT);
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      body TEXT,
      created_at DATETIME
    );
    INSERT INTO users (email, role, prefs) VALUES
      ('a@example.com', 'admin', '{"theme":"dark","lang":"zh"}'),
      ('b@example.com', 'member', '{"theme":"light"}');
    INSERT INTO posts (user_id, status, body) VALUES (1, 'draft', 'secret body text'), (2, 'published', 'hello');
  `);
  db.close();
}

test('PostgREST 的結構轉成清單:型別、可空、主鍵、外鍵、陣列、列舉', () => {
  const tables = kit.tablesFromOpenApi(OPENAPI);
  const text = kit.renderOutline(tables, { title: 'Demo', regen: 'npm run schema:outline' });
  assert.match(text, /^# Demo 資料表總覽/);
  assert.match(text, /# 重新產生:npm run schema:outline/);
  assert.ok(text.includes('- id: uuid  (PK)'));
  assert.ok(text.includes('- course_id: uuid  (-> courses.id)'));
  assert.ok(text.includes('- title: string\n'));
  assert.ok(text.includes('- duration?: int'));
  assert.ok(text.includes('- tags?: string[]'));
  assert.ok(text.includes('- meta?: json'));
  assert.ok(text.includes('- level?: easy | hard'));
  assert.ok(text.indexOf('\ncourses\n') < text.indexOf('\nlessons\n'), '資料表照字母排');
  assert.equal(kit.countColumns(tables), 8);
});

test('readTables 沒給連線資訊就報錯,不用任何預設值', async () => {
  await assert.rejects(() => kit.readTables({}), /需要 url 與 key/);
  await assert.rejects(() => kit.readTables({ url: 'https://db.example' }), /需要 url 與 key/);
});

test('readTables 讀 PostgREST 時只帶傳進來的金鑰,HTTP 失敗會報錯', async () => {
  const calls = [];
  const okFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => OPENAPI };
  };
  const tables = await kit.readTables({ url: 'https://db.example/', key: 'k1', fetch: okFetch });
  assert.equal(tables.length, 2);
  assert.equal(calls[0].url, 'https://db.example/rest/v1/');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer k1');
  const badFetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(() => kit.readTables({ url: 'https://db.example', key: 'k', fetch: badFetch }), /HTTP 401/);
});

test('SQLite:讀結構、主鍵、外鍵、型別對照', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'app.db');
  makeSqlite(file);
  const text = kit.renderOutline(await kit.readTables({ sqlite: file }));
  assert.ok(text.includes('posts\n- id: int  (PK)\n- user_id: int  (-> users.id)\n- status: string\n- body?: string\n- created_at?: datetime'));
  assert.ok(text.includes('users\n- id: int  (PK)\n- email: string\n- role?: string\n- prefs?: string'));
  assert.equal(kit.sqliteTypeName('VARCHAR(255)'), 'string');
  assert.equal(kit.sqliteTypeName(''), 'any');
  assert.equal(kit.sqliteTypeName('BIGINT'), 'int');
});

test('probe:列出 json 的 key 與狀態值,不印內文', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'app.db');
  makeSqlite(file);
  const text = await kit.probeTables({ sqlite: file }, ['users', 'posts', 'nope']);
  assert.ok(text.includes('users   # 2 筆'));
  assert.ok(text.includes('- role?: string   { admin | member }'));
  assert.ok(text.includes('- prefs?: string\n    theme, lang'), 'TEXT 欄位裡存的 json 也要認得');
  assert.ok(text.includes('- status: string   { draft | published }'));
  assert.ok(text.includes('nope   # 資料庫裡沒有這張表'));
  assert.ok(!text.includes('secret body text'), '不能把資料內文印出來');
  assert.ok(!text.includes('a@example.com'), '不能把資料內文印出來');
});

test('probe:值太多或太長的狀態欄位只報數量', () => {
  const table = { name: 't', columns: [{ name: 'kind', type: 'string', optional: false, fk: null }] };
  const many = Array.from({ length: 20 }, (_, i) => ({ kind: `k${i}` }));
  assert.match(kit.renderProbe(table, kit.summarizeRows(table, many), '20'), /# 20 種值,太多不列/);
  const long = [{ kind: 'x'.repeat(80) }];
  assert.match(kit.renderProbe(table, kit.summarizeRows(table, long), '1'), /# 1 種值,太多不列/);
});

test('parseMap:領域標題、表名與說明、子行、表後提醒;檔頭註解不收', () => {
  const text = [
    '# 檔頭說明,不該出現',
    '',
    '=====',
    '一、分站',
    '=====',
    '',
    'tenants                 # 一個分站',
    '- id: uuid  (PK)',
    '- features?: json',
    '    home_style: a | b',
    '# 提醒:這是坑',
    '',
    'site_settings',
    '- tenant_id?: uuid  (-> tenants.id)',
    '',
    '=====',
    '沒放進來的',
    '=====',
    '# 預約  bookings',
  ].join('\n');
  const sections = kit.parseMap(text);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].title, '一、分站');
  assert.deepEqual(sections[0].tables.map((t) => t.name), ['tenants', 'site_settings']);
  assert.equal(sections[0].tables[0].comment, '一個分站');
  assert.deepEqual(sections[0].tables[0].lines, [
    '- id: uuid  (PK)',
    '- features?: json',
    '    home_style: a | b',
    '# 提醒:這是坑',
  ]);
  assert.deepEqual(sections[1].notes, ['預約  bookings']);
  assert.ok(!JSON.stringify(sections).includes('檔頭說明'));
});

test('parseMap 讀得懂 renderOutline 產生的清單', () => {
  const sections = kit.parseMap(kit.renderOutline(kit.tablesFromOpenApi(OPENAPI)));
  assert.deepEqual(sections[0].tables.map((t) => t.name), ['courses', 'lessons']);
  assert.equal(sections[0].tables[1].lines.length, 7);
});

test('buildPage:資料裡的 script 結束標籤與標題的 HTML 都要跳脫', () => {
  const all = 'evil\n- note: string   # </script><script>alert(1)</script>\n';
  const html = kit.buildPage({ all, title: 'A & <b>', generatedAt: '2026-01-01' });
  assert.ok(html.includes('<title>A &amp; &lt;b&gt;</title>'));
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.equal(html.match(/<\/script>/g).length, 2, '只有樣板自己的兩個 script 結束標籤');
  assert.ok(html.includes('function parseMap('), '解析函式要被放進網頁');
  assert.ok(!html.includes('/*__'), '插入點都要被換掉');
  const data = JSON.parse(/<script type="application\/json" id="schema-data">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.equal(data.core, null);
  assert.equal(data.all, all);
});

test('buildPage:沒有清單就報錯', () => {
  assert.throws(() => kit.buildPage({ all: '  ' }), /需要 all/);
});

test('網頁裡的程式語法正確', () => {
  const html = kit.buildPage({ all: 'a\n- id: int\n', core: 'a\n- id: int\n' });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0]));
});

test('cli outline:寫出清單;0 張表時不覆寫既有檔案', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'app.db');
  makeSqlite(file);
  const out = path.join(dir, 'docs');
  const message = await main(['outline', '--db', file, '--dir', out, '--title', 'Demo']);
  assert.match(message, /2 張表、9 個欄位/);
  const written = fs.readFileSync(path.join(out, 'all-tables.txt'), 'utf8');
  assert.match(written, /^# Demo 資料表總覽/);

  const empty = path.join(dir, 'empty.db');
  const { DatabaseSync } = require('node:sqlite');
  new DatabaseSync(empty).close();
  await assert.rejects(() => main(['outline', '--db', empty, '--dir', out]), /0 張表,不覆寫/);
  assert.equal(fs.readFileSync(path.join(out, 'all-tables.txt'), 'utf8'), written);
});

test('cli page 與 init:沒有核心地圖也能出網頁;init 不蓋掉既有的', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'app.db');
  makeSqlite(file);
  const out = path.join(dir, 'docs');
  await assert.rejects(() => main(['page', '--dir', out]), /先跑 schema-map outline/);
  await main(['outline', '--db', file, '--dir', out]);
  assert.match(await main(['page', '--dir', out]), /只有全部資料表/);
  assert.match(await main(['init', '--dir', out]), /已放一份空白範本/);
  fs.writeFileSync(path.join(out, 'core-map.txt'), 'users   # mine\n- id: int\n');
  assert.match(await main(['init', '--dir', out]), /已經存在/);
  assert.equal(fs.readFileSync(path.join(out, 'core-map.txt'), 'utf8'), 'users   # mine\n- id: int\n');
  assert.match(await main(['page', '--dir', out]), /核心地圖 \+ 全部資料表/);
});

test('cli:缺連線資訊、不認得的選項、壞的 limit 都報錯', async () => {
  const dir = tempDir();
  const env = path.join(dir, '.env');
  fs.writeFileSync(env, '');
  const saved = {};
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  try {
    await assert.rejects(() => main(['outline', '--env', env]), /找不到資料庫網址/);
    fs.writeFileSync(env, 'SUPABASE_URL=https://db.example\n');
    await assert.rejects(() => main(['outline', '--env', env]), /找不到金鑰/);
  } finally {
    for (const [name, value] of Object.entries(saved)) if (value !== undefined) process.env[name] = value;
  }
  assert.throws(() => parseArgs(['--nope', 'x']), /不認得的選項/);
  assert.throws(() => parseArgs(['--db']), /後面要接一個值/);
  await assert.rejects(() => main(['probe', 'users', '--db', __filename, '--limit', '0']), /--limit/);
  await assert.rejects(() => main(['probe', '--db', __filename]), /至少一張表/);
  await assert.rejects(() => main(['wat']), /不認得的指令/);
});

test('env:讀 .env、去掉引號、行程的環境變數優先', () => {
  const dir = tempDir();
  const env = path.join(dir, '.env');
  fs.writeFileSync(env, '# c\nA="1"\nB=\'2\'\nbad line\nC=3\n');
  assert.deepEqual(readEnvFile(env), { A: '1', B: '2', C: '3' });
  assert.deepEqual(readEnvFile(path.join(dir, 'missing')), {});
  assert.equal(pickEnv(['X', 'A'], { A: '1' }, {}), '1');
  assert.equal(pickEnv(['A'], { A: '1' }, { A: 'env' }), 'env');
  assert.equal(pickEnv(['Z'], {}, {}), undefined);
});
