import type { UnzipFileInfo } from 'fflate';

const maximumEntries = 500;
const maximumEntryBytes = 25 * 1024 * 1024;
const maximumExpandedBytes = 32 * 1024 * 1024;

export function xlsxEntryFilter() {
  const names = new Set<string>();
  let entryCount = 0;
  let expandedBytes = 0;

  return {
    filter(file: UnzipFileInfo): boolean {
      entryCount += 1;
      expandedBytes += file.originalSize;
      if (entryCount > maximumEntries) throw new Error('Workbook contains too many ZIP entries');
      if (file.originalSize > maximumEntryBytes || expandedBytes > maximumExpandedBytes) {
        throw new Error('Workbook expands beyond the safety limit');
      }
      if (file.compression !== 0 && file.compression !== 8) {
        throw new Error('Workbook uses an unsupported ZIP compression method');
      }
      const name = file.name.replaceAll('\\', '/');
      if (
        !name ||
        name.startsWith('/') ||
        name.includes('\0') ||
        name.split('/').includes('..') ||
        names.has(name)
      ) {
        throw new Error('Workbook contains an unsafe ZIP entry');
      }
      names.add(name);
      if (/vbaproject|activex|embeddings/i.test(name)) {
        throw new Error('Workbook active content is not allowed');
      }
      return (
        name === 'xl/workbook.xml' ||
        name === 'xl/_rels/workbook.xml.rels' ||
        name === 'xl/sharedStrings.xml' ||
        /^xl\/worksheets\/[A-Za-z0-9_.-]+\.xml$/.test(name) ||
        /^xl\/worksheets\/_rels\/[A-Za-z0-9_.-]+\.xml\.rels$/.test(name) ||
        /^xl\/comments\d+\.xml$/.test(name) ||
        /^xl\/threadedComments\/threadedComment\d+\.xml$/.test(name)
      );
    },
    metrics: () => ({ entryCount, expandedBytes }),
  };
}
