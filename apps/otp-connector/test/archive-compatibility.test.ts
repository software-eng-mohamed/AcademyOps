import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { describe, expect, it } from 'vitest';

const connectorRequire = createRequire(join(__dirname, '..', 'package.json'));
const whatsappRequire = createRequire(connectorRequire.resolve('whatsapp-web.js'));
const archiveRequire = createRequire(whatsappRequire.resolve('archiver'));
const archiveUtils = archiveRequire('archiver-utils') as {
  file: { expand: (options: { cwd: string; dot: boolean }, patterns: string[]) => string[] };
};
const readdirGlob = archiveRequire('readdir-glob') as (
  cwd: string,
  options: { pattern: string; dot: boolean; ignore: string[]; nodir: boolean },
  callback: (error: Error | null, matches: string[]) => void,
) => void;
type Archive = Readable & {
  glob: (pattern: string, options: { cwd: string; dot: boolean; ignore: string[] }) => Archive;
  finalize: () => Promise<void>;
};
const archiver = whatsappRequire('archiver') as (format: 'zip') => Archive;
const unzipper = whatsappRequire('unzipper') as {
  Open: {
    buffer: (
      input: Buffer,
    ) => Promise<{ files: { path: string; buffer: () => Promise<Buffer> }[] }>;
  };
};
const expectedFiles = ['.hidden.json', 'nested/session.json', 'profile.json'];

async function withFixture(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'academyops-archive-'));
  if (dirname(directory) !== tmpdir()) throw new Error('Unexpected archive fixture path');
  try {
    await mkdir(join(directory, 'nested'));
    await mkdir(join(directory, 'private'));
    for (const file of [...expectedFiles, 'private/excluded.json', 'notes.txt']) {
      await writeFile(join(directory, file), JSON.stringify({ fixture: file }));
    }
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe('WhatsApp archive dependency compatibility', () => {
  it('expands inclusion and exclusion patterns through the archive utility', async () => {
    await withFixture((directory) => {
      const matches = archiveUtils.file.expand({ cwd: directory, dot: true }, [
        '**/*.json',
        '!private/**',
      ]);
      expect(matches.map((file) => file.replaceAll('\\', '/')).sort()).toEqual(expectedFiles);
      return Promise.resolve();
    });
  });

  it('matches nested and hidden session files while respecting ignored paths', async () => {
    await withFixture(async (directory) => {
      const matches = await new Promise<string[]>((resolve, reject) => {
        readdirGlob(
          directory,
          { pattern: '**/*.json', dot: true, ignore: ['private/**'], nodir: true },
          (error, files) => (error ? reject(error) : resolve(files)),
        );
      });
      expect(matches.sort()).toEqual(expectedFiles);
    });
  });

  it('creates and reads a real ZIP with the expected session files and contents', async () => {
    await withFixture(async (directory) => {
      const archive = archiver('zip');
      const output = new PassThrough();
      const chunks: Buffer[] = [];
      output.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.on('error', (error: Error) => output.destroy(error));
      archive.pipe(output);
      const completed = finished(output);
      archive.glob('**/*.json', { cwd: directory, dot: true, ignore: ['private/**'] });
      await archive.finalize();
      await completed;

      const entries = (await unzipper.Open.buffer(Buffer.concat(chunks))).files;
      expect(entries.map((entry) => entry.path).sort()).toEqual(expectedFiles);
      for (const entry of entries) {
        expect(JSON.parse((await entry.buffer()).toString('utf8'))).toEqual({
          fixture: entry.path,
        });
      }
    });
  });
});
