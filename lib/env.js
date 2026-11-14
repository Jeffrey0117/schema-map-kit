'use strict';

const fs = require('node:fs');

/** 讀 .env 檔成物件;檔案不存在回空物件 */
function readEnvFile(file) {
  if (!file || !fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );
}

/**
 * 依序從「行程的環境變數」與「.env 檔」找第一個有值的變數名。
 * 找不到回 undefined — 不提供任何預設值,由呼叫的人決定要不要報錯。
 */
function pickEnv(names, fileEnv, processEnv = process.env) {
  for (const name of names) {
    const value = processEnv[name] || fileEnv[name];
    if (value) return value;
  }
  return undefined;
}

module.exports = { readEnvFile, pickEnv };
