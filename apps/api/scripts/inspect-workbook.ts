import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readXlsxValues } from '../src/imports/xlsx-reader';

const sourcePath = process.argv[2];
if (!sourcePath) {
  throw new Error('Usage: pnpm --filter @academyops/api import:inspect -- <workbook.xlsx>');
}

const absolutePath = resolve(sourcePath);
const workbook = readXlsxValues(readFileSync(absolutePath));
const result = {
  sourcePath: absolutePath,
  sha256: workbook.sha256,
  entryCount: workbook.entryCount,
  uncompressedBytes: workbook.uncompressedBytes,
  commentCount: workbook.commentCount,
  sheets: workbook.sheets.map((sheet) => ({
    name: sheet.name,
    state: sheet.state,
    nonEmptyRows: sheet.rows.length,
  })),
  totalNonEmptyRows: workbook.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
