import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import { xlsxEntryFilter } from './xlsx-zip-safety';

export type XlsxScalar =
  | string
  | number
  | boolean
  | null
  | { error: string }
  | { formula: string; value: XlsxScalar };
export type XlsxComment = {
  cell: string;
  column: string;
  text: string;
  authorId?: string;
  createdAt?: string;
};
export type XlsxRow = {
  rowNumber: number;
  values: Record<string, XlsxScalar>;
  comments?: XlsxComment[];
};
export type XlsxSheet = {
  name: string;
  state: 'visible' | 'hidden' | 'veryHidden';
  rows: XlsxRow[];
};
export type XlsxWorkbook = {
  sha256: string;
  sheets: XlsxSheet[];
  entryCount: number;
  uncompressedBytes: number;
  commentCount: number;
};

type XmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  processEntities: false,
  trimValues: false,
});

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const asRecord = (value: unknown): XmlRecord =>
  value && typeof value === 'object' ? (value as XmlRecord) : {};

function decodeXmlPredefined(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

const asString = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return decodeXmlPredefined(value);
  if (['number', 'boolean', 'bigint'].includes(typeof value))
    return `${value as number | boolean | bigint}`;
  const record = asRecord(value);
  return '#text' in record ? asString(record['#text']) : '';
};

function textFromRichString(value: unknown): string {
  const record = asRecord(value);
  if ('t' in record) {
    const text = asRecord(record.t);
    return typeof record.t === 'string' ? record.t : asString(text['#text']);
  }
  return asArray(record.r)
    .map((run) => textFromRichString(run))
    .join('');
}

function columnName(reference: string): string {
  const match = /^[A-Z]+/i.exec(reference);
  return match?.[0]?.toUpperCase() ?? reference;
}

function normalizeTarget(target: string): string {
  const normalized = target.replaceAll('\\', '/').replace(/^\//, '');
  const relative = normalized.startsWith('xl/') ? normalized.slice(3) : normalized;
  if (!/^worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(relative)) {
    throw new Error('Unsafe OOXML worksheet relationship');
  }
  return `xl/${relative}`;
}

function normalizeRelatedPart(worksheetTarget: string, target: string): string {
  const normalized = target.replaceAll('\\', '/').replace(/^\//, '');
  const joined = posix.normalize(posix.join(posix.dirname(worksheetTarget), normalized));
  if (!/^xl\/(comments\d+\.xml|threadedComments\/threadedComment\d+\.xml)$/.test(joined)) {
    throw new Error('Unsafe OOXML comment relationship');
  }
  return joined;
}

function worksheetRelationshipsTarget(worksheetTarget: string): string {
  return posix.join(
    posix.dirname(worksheetTarget),
    '_rels',
    `${posix.basename(worksheetTarget)}.rels`,
  );
}

function commentRow(reference: string): number | null {
  const match = /^(?:[A-Z]+)(\d+)$/i.exec(reference);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function readComments(
  entries: Record<string, Uint8Array>,
  readXml: (name: string) => XmlRecord,
  worksheetTarget: string,
): XlsxComment[] {
  const relationshipTarget = worksheetRelationshipsTarget(worksheetTarget);
  if (!entries[relationshipTarget]) return [];
  const relationshipsXml = readXml(relationshipTarget);
  const relationships = asArray(asRecord(relationshipsXml.Relationships).Relationship).map(
    (value) => asRecord(value),
  );
  const threaded = relationships.find((relationship) =>
    asString(relationship['@_Type']).endsWith('/threadedComment'),
  );
  const legacy = relationships.find((relationship) =>
    asString(relationship['@_Type']).endsWith('/comments'),
  );
  const threadedComments: XlsxComment[] = [];
  if (threaded) {
    const part = normalizeRelatedPart(worksheetTarget, asString(threaded['@_Target']));
    const xml = entries[part] ? readXml(part) : {};
    threadedComments.push(
      ...asArray(asRecord(xml.ThreadedComments).threadedComment)
        .map((value): XlsxComment | null => {
          const comment = asRecord(value);
          const cell = asString(comment['@_ref']).toUpperCase();
          const row = commentRow(cell);
          const text = textFromRichString({ t: comment.text }).trim();
          if (!row || !text) return null;
          const authorId = asString(comment['@_personId']);
          const createdAt = asString(comment['@_dT']);
          return {
            cell,
            column: columnName(cell),
            text,
            ...(authorId ? { authorId } : {}),
            ...(createdAt ? { createdAt } : {}),
          };
        })
        .filter((value): value is XlsxComment => value !== null),
    );
  }
  if (!legacy) return threadedComments;
  const part = normalizeRelatedPart(worksheetTarget, asString(legacy['@_Target']));
  if (!entries[part]) return threadedComments;
  const xml = readXml(part);
  const comments = asArray(asRecord(asRecord(xml.comments).commentList).comment);
  const authors = asArray(asRecord(asRecord(xml.comments).authors).author).map((author) =>
    asString(author),
  );
  const threadedCells = new Set(threadedComments.map(({ cell }) => cell));
  const legacyComments = comments
    .map((value): XlsxComment | null => {
      const comment = asRecord(value);
      const cell = asString(comment['@_ref']).toUpperCase();
      const row = commentRow(cell);
      const rawText = textFromRichString(comment.text).trim();
      const text = rawText.includes('Comment:')
        ? rawText.slice(rawText.indexOf('Comment:') + 'Comment:'.length).trim()
        : rawText;
      if (!row || !text) return null;
      const authorId = authors[Number(asString(comment['@_authorId']))];
      return {
        cell,
        column: columnName(cell),
        text,
        ...(authorId ? { authorId } : {}),
      };
    })
    .filter((value): value is XlsxComment => value !== null);
  return [...threadedComments, ...legacyComments.filter(({ cell }) => !threadedCells.has(cell))];
}

function readCell(cellValue: unknown, sharedStrings: readonly string[]): XlsxScalar {
  const cell = asRecord(cellValue);
  const type = asString(cell['@_t']);
  const raw = asString(cell.v);
  let value: XlsxScalar;
  if (type === 's') value = sharedStrings[Number(raw)] ?? '';
  else if (type === 'inlineStr') value = textFromRichString(cell.is);
  else if (type === 'b') value = raw === '1';
  else if (type === 'e') value = { error: raw };
  else if (type === 'str') value = raw;
  else if (raw === '') value = null;
  else {
    const numeric = Number(raw);
    value = Number.isFinite(numeric) ? numeric : raw;
  }

  const formula = asString(cell.f);
  return formula ? { formula, value } : value;
}

export function readXlsxValues(buffer: Buffer): XlsxWorkbook {
  if (buffer.byteLength > 25 * 1024 * 1024)
    throw new Error('Workbook exceeds the 25 MB upload limit');
  if (buffer.subarray(0, 4).toString('hex') !== '504b0304') {
    throw new Error('Workbook is not a ZIP-based XLSX file');
  }
  const safety = xlsxEntryFilter();
  const entries = unzipSync(new Uint8Array(buffer), { filter: (file) => safety.filter(file) });
  const { entryCount, expandedBytes: uncompressedBytes } = safety.metrics();

  const readXml = (name: string): XmlRecord => {
    const bytes = entries[name];
    if (!bytes) throw new Error(`Missing required OOXML entry: ${name}`);
    const xml = Buffer.from(bytes).toString('utf8');
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Workbook XML entities are not allowed');
    return asRecord(parser.parse(xml));
  };

  const sharedXml = entries['xl/sharedStrings.xml'] ? readXml('xl/sharedStrings.xml') : {};
  const sharedStrings = asArray(asRecord(sharedXml.sst).si).map((item) => textFromRichString(item));
  if (sharedStrings.length > 250_000) throw new Error('Workbook has too many shared strings');
  const workbookXml = readXml('xl/workbook.xml');
  const relationshipsXml = readXml('xl/_rels/workbook.xml.rels');
  const sheetDefinitions = asArray(asRecord(asRecord(workbookXml.workbook).sheets).sheet);
  const sheetRelationshipIds = new Set(
    sheetDefinitions.map((sheetValue) => asString(asRecord(sheetValue)['@_id'])),
  );
  const relationships = new Map(
    asArray(asRecord(relationshipsXml.Relationships).Relationship)
      .map((relationshipValue) => asRecord(relationshipValue))
      .filter((relationship) => sheetRelationshipIds.has(asString(relationship['@_Id'])))
      .map(
        (relationship) =>
          [
            asString(relationship['@_Id']),
            normalizeTarget(asString(relationship['@_Target'])),
          ] as const,
      ),
  );
  let totalRows = 0;
  let totalCells = 0;
  let commentCount = 0;
  const sheets = sheetDefinitions.map((sheetValue): XlsxSheet => {
    const sheet = asRecord(sheetValue);
    const name = asString(sheet['@_name']);
    const relationshipId = asString(sheet['@_id']);
    const target = relationships.get(relationshipId);
    if (!target) throw new Error(`Missing relationship for sheet ${name}`);
    const worksheet = asRecord(readXml(target).worksheet);
    const comments = readComments(entries, readXml, target);
    commentCount += comments.length;
    const commentsByRow = new Map<number, XlsxComment[]>();
    for (const comment of comments) {
      const rowNumber = commentRow(comment.cell);
      if (!rowNumber) continue;
      const current = commentsByRow.get(rowNumber) ?? [];
      current.push(comment);
      commentsByRow.set(rowNumber, current);
    }
    const rowValues = asArray(asRecord(worksheet.sheetData).row);
    if (rowValues.length > 100_000) throw new Error('Worksheet has too many rows');
    totalRows += rowValues.length;
    if (totalRows > 150_000) throw new Error('Workbook has too many rows');
    const rows = rowValues
      .map((rowValue): XlsxRow | null => {
        const row = asRecord(rowValue);
        const values: Record<string, XlsxScalar> = {};
        const cells = asArray(row.c);
        if (cells.length > 512) throw new Error('Worksheet row has too many cells');
        totalCells += cells.length;
        if (totalCells > 2_000_000) throw new Error('Workbook has too many cells');
        for (const cellValue of cells) {
          const cell = asRecord(cellValue);
          const column = columnName(asString(cell['@_r']));
          const value = readCell(cell, sharedStrings);
          if (value !== null && value !== '') values[column] = value;
        }
        if (Object.keys(values).length === 0) return null;
        const rowNumber = Number(row['@_r']);
        const rowComments = commentsByRow.get(rowNumber);
        return { rowNumber, values, ...(rowComments?.length ? { comments: rowComments } : {}) };
      })
      .filter((row): row is XlsxRow => row !== null);
    const presentRows = new Set(rows.map(({ rowNumber }) => rowNumber));
    for (const [rowNumber, rowComments] of commentsByRow) {
      if (!presentRows.has(rowNumber)) rows.push({ rowNumber, values: {}, comments: rowComments });
    }
    rows.sort((left, right) => left.rowNumber - right.rowNumber);
    const state = asString(sheet['@_state']) || 'visible';
    return {
      name,
      state: state === 'hidden' || state === 'veryHidden' ? state : 'visible',
      rows,
    };
  });

  return {
    sha256: createHash('sha256').update(buffer).digest('hex'),
    sheets,
    entryCount,
    uncompressedBytes,
    commentCount,
  };
}
