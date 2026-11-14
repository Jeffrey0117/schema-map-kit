'use strict';

const { sqliteTypeName } = require('./format');

function openDatabase(file) {
  let sqlite;
  try {
    sqlite = require('node:sqlite');
  } catch (error) {
    throw new Error('讀 SQLite 需要 Node 22.5 以上(內建的 node:sqlite);目前的 Node 沒有這個模組');
  }
  // readOnly:只讀,不會動到檔案
  return new sqlite.DatabaseSync(file, { readOnly: true });
}

function quoteName(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function listTableNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function readColumns(db, table) {
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${quoteName(table)})`).all();
  const fkByColumn = new Map(foreignKeys.map((fk) => [fk.from, { table: fk.table, column: fk.to || 'id' }]));
  return db
    .prepare(`PRAGMA table_info(${quoteName(table)})`)
    .all()
    .map((info) => ({
      name: info.name,
      type: sqliteTypeName(info.type),
      rawType: String(info.type || '').toLowerCase(),
      optional: info.notnull === 0 && info.pk === 0,
      pk: info.pk > 0,
      fk: fkByColumn.get(info.name) || null,
    }));
}

/**
 * 讀一個 SQLite 檔的結構(唯讀)。
 * @param {string} file
 */
function readSqliteTables(file) {
  if (!file) throw new Error('readSqliteTables 需要資料庫檔案路徑');
  const db = openDatabase(file);
  try {
    return listTableNames(db).map((name) => ({ name, columns: readColumns(db, name) }));
  } finally {
    db.close();
  }
}

/**
 * 抽樣一張表的資料(唯讀)。回傳 { rows, total }。
 * @param {{ file: string, table: string, limit?: number }} opts
 */
function sampleSqliteRows(opts) {
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 400;
  const db = openDatabase(opts.file);
  try {
    if (!listTableNames(db).includes(opts.table)) throw new Error(`找不到資料表 ${opts.table}`);
    const name = quoteName(opts.table);
    const rows = db.prepare(`SELECT * FROM ${name} LIMIT ${limit}`).all();
    const total = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
    return { rows, total: String(total) };
  } finally {
    db.close();
  }
}

module.exports = { readSqliteTables, sampleSqliteRows };
