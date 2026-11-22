/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';

// expo-router takes every .js/.jsx/.ts/.tsx file under app/app/ as a route, so
// no test file or __tests__ folder may live there.
const ROUTES_DIR = path.join(__dirname, '..', 'app');

function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listFiles(path.join(dir, entry.name), rel));
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

function isTestPath(rel: string): boolean {
  const segments = rel.split('/');
  const name = segments[segments.length - 1];
  return segments.includes('__tests__') || /\.(test|spec)\.[jt]sx?$/.test(name);
}

describe('routes folder', () => {
  it('A10-AC-1: no test file or __tests__ folder under app/app/', () => {
    const files = listFiles(ROUTES_DIR);
    expect(files).toContain('_layout.tsx');
    expect(files).toContain('(tabs)/home.tsx');
    expect(files.filter(isTestPath)).toEqual([]);
  });

  it('A10-AC-2: flags test files and __tests__ folders at any depth', () => {
    for (const p of [
      '(tabs)/__tests__/home.test.tsx',
      '(tabs)/__tests__/helper.ts',
      'lesson/[id].test.tsx',
      'tutor.spec.ts',
      '__tests__/x.tsx',
    ]) {
      expect({ path: p, flagged: isTestPath(p) }).toEqual({ path: p, flagged: true });
    }
  });

  it('A10-AC-2: does not flag ordinary route files', () => {
    for (const p of [
      '_layout.tsx',
      '(tabs)/home.tsx',
      'lesson/[id].tsx',
      '(auth)/sign-in.tsx',
      'tutor.tsx',
      'testing.tsx',
    ]) {
      expect({ path: p, flagged: isTestPath(p) }).toEqual({ path: p, flagged: false });
    }
  });
});
