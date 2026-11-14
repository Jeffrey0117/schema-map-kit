'use strict';

// ============================================================================
// schema-map-kit — 資料庫結構地圖
//   讀資料庫結構 → 「表名 + 欄位: 型別」文字清單 → 可搜尋的單頁網頁
//   來源:Supabase / PostgREST,或 SQLite 檔。零依賴(node 內建)。
//   連線資訊一律由呼叫的人傳入,這裡不讀任何預設值。
// ============================================================================

const { renderOutline, countColumns, postgresTypeName, sqliteTypeName } = require('./lib/format');
const { readPostgrestTables, samplePostgrestRows, tablesFromOpenApi } = require('./lib/postgrest');
const { readSqliteTables, sampleSqliteRows } = require('./lib/sqlite');
const { summarizeRows, renderProbe } = require('./lib/probe');
const { parseMap } = require('./lib/parse-map');
const { buildPage } = require('./lib/page');

/**
 * 讀資料表結構。
 * @param {{ sqlite?: string, url?: string, key?: string, fetch?: Function }} source
 *   給 sqlite(檔案路徑)就讀 SQLite;否則用 url + key 讀 Supabase / PostgREST
 */
async function readTables(source) {
  if (source && source.sqlite) return readSqliteTables(source.sqlite);
  return readPostgrestTables(source || {});
}

/**
 * 抽樣幾張表,回傳可以貼進核心地圖改的文字(唯讀)。
 * @param {object} source 同 readTables
 * @param {string[]} tableNames
 * @param {{ limit?: number }} [opts]
 */
async function probeTables(source, tableNames, opts = {}) {
  const tables = await readTables(source);
  const blocks = [];
  for (const name of tableNames) {
    const table = tables.find((item) => item.name === name);
    if (!table) {
      blocks.push(`${name}   # 資料庫裡沒有這張表`);
      continue;
    }
    const sample = source.sqlite
      ? sampleSqliteRows({ file: source.sqlite, table: name, limit: opts.limit })
      : await samplePostgrestRows({ ...source, table: name, limit: opts.limit });
    blocks.push(renderProbe(table, summarizeRows(table, sample.rows), sample.total));
  }
  return blocks.join('\n\n');
}

module.exports = {
  readTables,
  renderOutline,
  countColumns,
  probeTables,
  summarizeRows,
  renderProbe,
  parseMap,
  buildPage,
  tablesFromOpenApi,
  postgresTypeName,
  sqliteTypeName,
};
