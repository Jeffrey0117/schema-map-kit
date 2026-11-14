'use strict';

// 最小範例:node example.js
// 用 examples/course-platform/schema.sql 建一個暫存的 SQLite,走完整條流程:
//   讀結構 → 寫清單 → 抽樣 → 加上手寫的核心地圖 → 包成網頁
// 全部寫在系統暫存資料夾,不會動到這個 repo。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kit = require('./index');

const EXAMPLE = path.join(__dirname, 'examples', 'course-platform');

async function main() {
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-map-example-'));
  const dbFile = path.join(dir, 'course-platform.db');

  const db = new DatabaseSync(dbFile);
  db.exec(fs.readFileSync(path.join(EXAMPLE, 'schema.sql'), 'utf8'));
  db.exec(`
    INSERT INTO profiles (id, full_name, user_type) VALUES ('u1', 'Demo Owner', 'creator');
    INSERT INTO tenants (id, slug, owner_id, name, plan_tier, enabled_features) VALUES
      ('t1', 'demo', 'u1', 'Demo School', 'free', '{"business_type":"courses","home_style":"catalog"}'),
      ('t2', 'shop', 'u1', 'Demo Shop', 'pro', '{"business_type":"shop"}');
  `);
  db.close();

  const tables = await kit.readTables({ sqlite: dbFile });
  const all = kit.renderOutline(tables, { title: '線上課程平台(示範)', regen: 'node example.js' });
  console.log(`讀到 ${tables.length} 張表、${kit.countColumns(tables)} 個欄位\n`);
  console.log(all.split('\n').slice(0, 14).join('\n'));

  console.log('\n--- probe tenants(唯讀抽樣)---\n');
  console.log(await kit.probeTables({ sqlite: dbFile }, ['tenants']));

  const core = fs.readFileSync(path.join(EXAMPLE, 'core-map.txt'), 'utf8');
  const html = kit.buildPage({ all, core, title: '線上課程平台(示範)' });
  const pageFile = path.join(dir, 'schema.html');
  fs.writeFileSync(pageFile, html, 'utf8');
  console.log(`\n網頁寫在 ${pageFile}(用瀏覽器打開)`);
}

main().catch((error) => {
  console.error(`example 失敗:${error.message}`);
  process.exit(1);
});
