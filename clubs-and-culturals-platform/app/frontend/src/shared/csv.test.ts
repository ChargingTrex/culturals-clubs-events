import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv (AR-11 preview)', () => {
  it('reads quoted commas, doubled quotes, CRLF and a BOM, and skips blank lines', () => {
    const text = '﻿head,amount\r\n"Sound, lights",12000\r\n\r\n"The ""big"" banner",1500\n';
    expect(parseCsv(text).rows).toEqual([
      ['head', 'amount'],
      ['Sound, lights', '12000'],
      ['The "big" banner', '1500'],
    ]);
  });

  it('keeps a last row with no newline and says when it stopped early', () => {
    expect(parseCsv('a,b\n1,2').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    const long = parseCsv('h\n1\n2\n3\n', 2);
    expect(long.rows).toHaveLength(2);
    expect(long.truncated).toBe(true);
  });
});
