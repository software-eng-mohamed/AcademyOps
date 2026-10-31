import { strToU8, zipSync } from 'fflate';

type Cell = string | number;
type Sheet = { name: string; state?: 'hidden'; rows: Array<Record<string, Cell>> };

const escapeXml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function worksheet(rows: Array<Record<string, Cell>>): string {
  const body = rows
    .map((values, index) => {
      const cells = Object.entries(values)
        .map(([column, value]) =>
          typeof value === 'number'
            ? `<c r="${column}${index + 1}"><v>${value}</v></c>`
            : `<c r="${column}${index + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`,
        )
        .join('');
      return `<row r="${index + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0"?><worksheet><sheetData>${body}</sheetData></worksheet>`;
}

export function createImportWorkbook(
  legacyCode: string,
  options: {
    invalidMaster?: boolean;
    roomCollision?: boolean;
    noPayment?: boolean;
    secondBranch?: boolean;
    duplicateCodePerson?: boolean;
  } = {},
): Buffer {
  const sheets: Sheet[] = [
    {
      name: 'Master Sheet',
      rows: [
        {},
        {},
        {
          A: 'Code',
          B: 'State',
          D: 'Trainee Name(English)',
          E: 'Trainee Name(Arabic)',
          F: 'Phone Number',
          G: 'Email',
          M: 'Registration',
          N: 'Diploma Number',
          O: 'Original Price',
          Q: 'Total Amount',
          T: 'Paid',
        },
        {
          A: legacyCode,
          B: 'Active',
          D: 'Import Student',
          E: 'طالب مستورد',
          F: '01012345678',
          G: `${legacyCode.toLowerCase()}@example.test`,
          I: 'Individual',
          K: 'Main',
          L: 'Offline',
          M: 'TST',
          N: 'TST 1',
          O: 1000,
          P: 0,
          Q: 1000,
          T: options.noPayment ? 0 : 1000,
          U: options.noPayment ? 0 : 500,
          V: 'Cash',
          W: '2026-01-02',
          X: options.noPayment ? 0 : 500,
          Y: 'Cash',
          Z: '2026-01-03',
        },
      ],
    },
    {
      name: 'Attendance & Cert.',
      rows: [
        { A: 'State', B: 'TraineeName', E: 'Diploma Number', F: 'Phone no.', M: 'S1' },
        {
          A: 'Active',
          B: 'Import Student',
          D: 'Done',
          C: 'طالب مستورد',
          E: 'TST 1',
          F: '01012345678',
          G: 'TST',
          H: `${legacyCode.toLowerCase()}@example.test`,
          L: 1,
          M: 1,
          N: 'TST 1',
        },
      ],
    },
    {
      name: 'Annual Calendar - 2026',
      rows: [
        {},
        { B: 'Program', C: 'Group no.', D: 'Session #', E: 'Module name', G: 'Date' },
        { J: 'Start', K: 'End' },
        {
          B: 'Test Program',
          C: 'TST 1',
          D: 'S1',
          E: 'Test Module',
          F: 'Test Trainer',
          G: 'Fri-02-Jan',
          H: 'ROOM-1',
          I: 'Offline',
          J: 0.375,
          K: 0.625,
        },
      ],
    },
    {
      name: 'Legacy Archive',
      state: 'hidden',
      rows: [{ A: 'duplicate archived row' }, { A: 'duplicate archived row' }],
    },
  ];
  if (options.invalidMaster) {
    sheets[0]!.rows.push({
      A: `${legacyCode}-BAD`,
      B: 'Active',
      D: 'Quarantined Student',
      M: 'TST',
      N: 'TST 1',
      O: 1000,
      Q: 1000,
      T: 1200,
      U: 1200,
      V: 'Cash',
      W: '2026-01-02',
    });
  }
  if (options.secondBranch) {
    sheets[0]!.rows.push({
      A: `${legacyCode}-BR`,
      B: 'Active',
      D: 'Second Branch Student',
      I: 'Individual',
      K: 'Nasr City',
      L: 'Online',
      M: 'TST',
      N: 'TST 1',
      O: 1000,
      Q: 1000,
      T: 0,
    });
  }
  if (options.duplicateCodePerson) {
    sheets[0]!.rows.push({
      A: legacyCode,
      B: 'Active',
      D: 'Different Human',
      I: 'Individual',
      K: 'Main',
      L: 'Offline',
      M: 'TST',
      N: 'TST 2',
      O: 1000,
      Q: 1000,
      T: 0,
    });
  }
  if (options.roomCollision) {
    sheets[2]!.rows.push({
      B: 'Test Program',
      C: 'TST 2',
      D: 'S1',
      E: 'Other Module',
      F: 'Other Trainer',
      G: 'Fri-02-Jan',
      H: 'ROOM-1',
      I: 'Offline',
      J: 0.375,
      K: 0.625,
    });
  }
  const workbookSheets = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}"${sheet.state ? ` state="${sheet.state}"` : ''} sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  const relationships = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');
  const entries: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0"?><workbook xmlns:r="urn:r"><sheets>${workbookSheets}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0"?><Relationships>${relationships}</Relationships>`,
    ),
  };
  sheets.forEach((sheet, index) => {
    entries[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheet(sheet.rows));
  });
  return Buffer.from(zipSync(entries));
}
