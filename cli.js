#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const kit = require('./index');
const { readEnvFile, pickEnv } = require('./lib/env');

const HELP = `schema-map — 資料庫結構地圖

  schema-map outline            讀資料庫結構,寫出 all-tables.txt
  schema-map probe <表...>      抽樣幾張表:json 欄位裡的 key、狀態欄位出現過的值(唯讀,只印到畫面)
  schema-map page               把 core-map.txt 與 all-tables.txt 包成 schema.html
  schema-map init               放一份核心地圖的空白範本(已存在就不動)

資料庫來源(outline / probe)
  --db <檔案>          讀 SQLite 檔
  (沒給 --db)          讀 Supabase / PostgREST,網址與金鑰從環境變數或 .env 讀
  --env <檔案>         .env 的位置(預設 ./.env)
  --url-var <名稱>     網址的變數名(預設依序找 NEXT_PUBLIC_SUPABASE_URL、SUPABASE_URL)
  --key-var <名稱>     金鑰的變數名(預設 SUPABASE_SERVICE_ROLE_KEY)

其他
  --dir <資料夾>       地圖檔放哪(預設 docs/schema)
  --title <標題>       清單檔頭與網頁的標題
  --regen <指令>       寫在清單檔頭的「重新產生」指令
  --limit <筆數>       probe 每張表抽樣幾筆(預設 400)`;

const VALUE_FLAGS = new Set(['db', 'env', 'url-var', 'key-var', 'dir', 'title', 'regen', 'limit']);

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (!VALUE_FLAGS.has(name)) throw new Error(`不認得的選項 ${arg}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} 後面要接一個值`);
    flags[name] = value;
    i += 1;
  }
  return { flags, positional };
}

function resolveSource(flags) {
  if (flags.db) {
    const file = path.resolve(flags.db);
    if (!fs.existsSync(file)) throw new Error(`找不到資料庫檔 ${file}`);
    return { sqlite: file };
  }
  const fileEnv = readEnvFile(path.resolve(flags.env || '.env'));
  const urlNames = flags['url-var'] ? [flags['url-var']] : ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
  const keyNames = flags['key-var'] ? [flags['key-var']] : ['SUPABASE_SERVICE_ROLE_KEY'];
  const url = pickEnv(urlNames, fileEnv);
  const key = pickEnv(keyNames, fileEnv);
  if (!url) throw new Error(`找不到資料庫網址(${urlNames.join(' / ')});或用 --db 指定 SQLite 檔`);
  if (!key) throw new Error(`找不到金鑰(${keyNames.join(' / ')})`);
  return { url, key };
}

function schemaDir(flags) {
  return path.resolve(flags.dir || 'docs/schema');
}

async function outline(flags) {
  const tables = await kit.readTables(resolveSource(flags));
  if (tables.length === 0) throw new Error('資料庫回報 0 張表,不覆寫既有檔案');
  const dir = schemaDir(flags);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'all-tables.txt');
  fs.writeFileSync(file, kit.renderOutline(tables, { title: flags.title, regen: flags.regen }), 'utf8');
  return `${tables.length} 張表、${kit.countColumns(tables)} 個欄位 → ${path.relative(process.cwd(), file)}`;
}

async function probe(flags, tableNames) {
  if (tableNames.length === 0) throw new Error('probe 要給至少一張表的名字');
  const limit = flags.limit === undefined ? undefined : Number(flags.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 5000)) {
    throw new Error('--limit 要是 1 到 5000 的整數');
  }
  return kit.probeTables(resolveSource(flags), tableNames, { limit });
}

function page(flags) {
  const dir = schemaDir(flags);
  const allFile = path.join(dir, 'all-tables.txt');
  const coreFile = path.join(dir, 'core-map.txt');
  if (!fs.existsSync(allFile)) throw new Error(`找不到 ${allFile},先跑 schema-map outline`);
  const html = kit.buildPage({
    all: fs.readFileSync(allFile, 'utf8'),
    core: fs.existsSync(coreFile) ? fs.readFileSync(coreFile, 'utf8') : undefined,
    title: flags.title,
  });
  const file = path.join(dir, 'schema.html');
  fs.writeFileSync(file, html, 'utf8');
  const tabs = fs.existsSync(coreFile) ? '核心地圖 + 全部資料表' : '只有全部資料表(沒有 core-map.txt)';
  return `${path.relative(process.cwd(), file)}(${tabs})`;
}

function init(flags) {
  const dir = schemaDir(flags);
  const file = path.join(dir, 'core-map.txt');
  if (fs.existsSync(file)) return `${path.relative(process.cwd(), file)} 已經存在,沒有動它`;
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, 'core-map.template.txt'), file);
  return `已放一份空白範本 → ${path.relative(process.cwd(), file)}`;
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') return HELP;
  const { flags, positional } = parseArgs(rest);
  if (command === 'outline') return outline(flags);
  if (command === 'probe') return probe(flags, positional);
  if (command === 'page') return page(flags);
  if (command === 'init') return init(flags);
  throw new Error(`不認得的指令 ${command}\n\n${HELP}`);
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((message) => process.stdout.write(`${message}\n`))
    .catch((error) => {
      process.stderr.write(`schema-map 失敗:${error.message}\n`);
      process.exit(1);
    });
}

module.exports = { main, parseArgs };
