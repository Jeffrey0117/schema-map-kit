'use strict';

/**
 * 把地圖文字檔(core-map.txt 或 all-tables.txt)切成結構。
 *
 * 這支函式會被原樣放進網頁裡在瀏覽器執行(見 lib/page.js),
 * 所以必須自給自足:不能引用檔案裡的其他東西,也不用新語法。
 *
 * 回傳 [{ title, notes: string[], tables: [{ name, comment, lines: string[] }] }]
 *   - 兩條 ===== 中間的那一行是領域標題
 *   - 頂格、只有小寫英數與底線的一行是資料表名(後面可接 # 說明)
 *   - 表名之後到下一張表之前的每一行都算那張表的內容
 *   - 檔頭在第一張表或第一個標題之前的 # 註解是給編輯的人看的,不收
 */
function parseMap(text) {
  var TABLE_LINE = /^([a-z][a-z0-9_]*)(\s+#\s?(.*))?$/;
  var RULE_LINE = /^=+$/;
  var sections = [{ title: '', notes: [], tables: [] }];
  var lines = String(text || '').split(/\r?\n/);
  var current = null;
  var started = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (RULE_LINE.test(line)) {
      var next = lines[i + 1] || '';
      if (next && !RULE_LINE.test(next)) {
        sections.push({ title: next.trim(), notes: [], tables: [] });
        current = null;
        started = true;
        i += 2;
      }
      continue;
    }
    if (!line.trim()) continue;
    var section = sections[sections.length - 1];
    var match = TABLE_LINE.exec(line);
    if (match) {
      current = { name: match[1], comment: match[3] || '', lines: [] };
      section.tables.push(current);
      started = true;
      continue;
    }
    if (current) {
      current.lines.push(line);
    } else if (started && line.charAt(0) === '#') {
      section.notes.push(line.replace(/^#\s?/, ''));
    }
  }
  return sections.filter(function (s) {
    return s.tables.length > 0 || s.notes.length > 0;
  });
}

module.exports = { parseMap };
