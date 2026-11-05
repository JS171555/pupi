import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const source = await readFile(new URL('DESIGN.md', root), 'utf8');
const frontmatter = source.split('---')[1];
const group = name => {
  const lines = frontmatter.split('\n'); const start = lines.indexOf(`${name}:`);
  if (start < 0) return '';
  let end = start + 1;
  while (end < lines.length && !/^[a-z]/.test(lines[end])) end++;
  return lines.slice(start + 1, end).join('\n');
};
const entries = value => [...value.matchAll(/^  ([\w-]+):\s*"([^"]+)"/gm)].map(m => [m[1], m[2]]);
const lines = entries(group('colors')).map(([name, value]) => `  --color-${name}: ${value};`);
for (const [name, value] of entries(group('rounded'))) lines.push(`  --radius-${name.toLowerCase()}: ${value};`);
for (const [name, value] of entries(group('spacing'))) lines.push(`  --space-${name}: ${value};`);
for (const match of group('typography').matchAll(/^  ([\w-]+):\n    fontFamily: "([^"]+)"/gm)) {
  lines.push(`  --font-${match[1]}: ${match[2]};`);
}
if (lines.length < 15) throw new Error('Tokens incompletos em DESIGN.md.');
const css = '/* Gerado por scripts/design-tokens.js a partir de DESIGN.md. */\n:root {\n' + lines.join('\n') + '\n}\n';
const target = new URL('src/styles/tokens.css', root);
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== css) throw new Error('Execute npm run design:generate para atualizar os tokens.');
  console.log('Tokens do Pupi conferidos.');
} else await writeFile(target, css);
