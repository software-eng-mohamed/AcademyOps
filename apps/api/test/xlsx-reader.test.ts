import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readXlsxValues } from '../src/imports/xlsx-reader';

describe('safe OOXML value reader', () => {
  it('reads values and formulas while ignoring malformed comment metadata', () => {
    const workbook = Buffer.from(
      zipSync({
        'xl/workbook.xml': strToU8(
          `<?xml version="1.0"?><workbook xmlns:r="urn:r"><sheets><sheet name="Attendance &amp; Cert. &amp;lt;" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
          `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="theme/theme1.xml"/><Relationship Id="rId3" Target="https://example.invalid/external" TargetMode="External"/></Relationships>`,
        ),
        'xl/sharedStrings.xml': strToU8(
          `<?xml version="1.0"?><sst><si><t>Code</t></si><si><t>PLG-1</t></si></sst>`,
        ),
        'xl/worksheets/sheet1.xml': strToU8(
          `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><f>1+1</f><v>2</v></c><c r="C2" t="e"><v>#REF!</v></c></row></sheetData></worksheet>`,
        ),
        'xl/worksheets/_rels/sheet1.xml.rels': strToU8(
          `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2017/10/relationships/threadedComment" Target="../threadedComments/threadedComment1.xml"/></Relationships>`,
        ),
        'xl/threadedComments/threadedComment1.xml': strToU8(
          `<?xml version="1.0"?><ThreadedComments><threadedComment ref="A2" dT="2026-08-25T07:00:00Z" personId="person-1"><text>Collection follow-up required</text></threadedComment></ThreadedComments>`,
        ),
        'xl/persons/person.xml': strToU8(
          `<?xml version="1.0"?><personList><person displayName=""/></personList>`,
        ),
      }),
    );

    const parsed = readXlsxValues(workbook);
    expect(parsed.sheets).toHaveLength(1);
    expect(parsed.sheets[0]?.name).toBe('Attendance & Cert. &lt;');
    expect(parsed.sheets[0]?.rows[1]?.values).toEqual({
      A: 'PLG-1',
      B: { formula: '1+1', value: 2 },
      C: { error: '#REF!' },
    });
    expect(parsed.commentCount).toBe(1);
    expect(parsed.sheets[0]?.rows[1]?.comments).toEqual([
      {
        cell: 'A2',
        column: 'A',
        text: 'Collection follow-up required',
        authorId: 'person-1',
        createdAt: '2026-08-25T07:00:00Z',
      },
    ]);
  });

  it('rejects XML entities and active workbook content before parsing', () => {
    const entityWorkbook = Buffer.from(
      zipSync({
        'xl/workbook.xml': strToU8('<!DOCTYPE x [<!ENTITY y "boom">]><workbook/>'),
        'xl/_rels/workbook.xml.rels': strToU8('<Relationships/>'),
      }),
    );
    const macroWorkbook = Buffer.from(
      zipSync({
        'xl/workbook.xml': strToU8('<workbook/>'),
        'xl/_rels/workbook.xml.rels': strToU8('<Relationships/>'),
        'xl/vbaProject.bin': new Uint8Array([1, 2, 3]),
      }),
    );

    expect(() => readXlsxValues(entityWorkbook)).toThrow(/entities/i);
    expect(() => readXlsxValues(macroWorkbook)).toThrow(/active content/i);
  });
});
