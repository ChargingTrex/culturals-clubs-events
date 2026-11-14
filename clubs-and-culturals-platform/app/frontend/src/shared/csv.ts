/**
 * Read a CSV for display (AR-11): quoted fields, doubled quotes, CRLF and a BOM.
 * Display only. The server parses the sheet again on upload and is the judge of it.
 */
export function parseCsv(text: string, maxRows = 500): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      endRow();
      if (rows.length > maxRows) return { rows: rows.slice(0, maxRows), truncated: true };
    } else field += ch;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows.length > maxRows
    ? { rows: rows.slice(0, maxRows), truncated: true }
    : { rows, truncated: false };
}
