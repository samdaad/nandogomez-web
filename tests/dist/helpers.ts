import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

export const DIST = join(import.meta.dirname, '../../dist');

export function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

export const distFiles = (): string[] => walk(DIST);
export const read = (p: string): string => readFileSync(p, 'utf8');

/** Parsea con jsdom sin ejecutar scripts. */
export function pages(): { file: string; html: string; doc: Document }[] {
  return distFiles()
    .filter((f) => f.endsWith('.html'))
    .map((file) => {
      const html = read(file);
      return { file, html, doc: new JSDOM(html).window.document };
    });
}
