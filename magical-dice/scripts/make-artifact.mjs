// Rewrites dist/index.html into artifact-contract shape: page content only,
// no outer <!doctype>/<html>/<head>/<body> shell (the artifact host supplies
// those), and no links to files that don't exist on a single-file host.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(ROOT, 'dist/index.html');
let html = fs.readFileSync(file, 'utf8');

const cut = (re, label) => {
  const before = html.length;
  html = html.replace(re, '');
  if (html.length === before) throw new Error('pattern not found: ' + label);
};

cut(/^\s*<!doctype html>\s*/i, 'doctype');
cut(/<html[^>]*>\s*/i, '<html>');
cut(/<head>\s*/i, '<head>');
cut(/\s*<\/head>\s*<body>/i, '</head><body>');
if (!/<\/body>\s*<\/html>\s*$/i.test(html)) throw new Error('tail not found');
html = html.replace(/<\/body>\s*<\/html>\s*$/i, '\n');
cut(/\s*<link rel="apple-touch-icon"[^>]*\/>/, 'apple-touch-icon link');
cut(/\s*<link rel="manifest"[^>]*\/>/, 'manifest link');

fs.writeFileSync(file, html);
console.log('artifact-shaped', file, (html.length / 1024).toFixed(0) + 'KB');
