#!/usr/bin/env node
// Static wiring checks for the UI: element lookups, CSS balance, and class usage.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const ui = join(root, "ui");
const failures = [];

const html = readFileSync(join(ui, "index.html"), "utf8");
const js = readFileSync(join(ui, "app.js"), "utf8");
const css = readFileSync(join(ui, "styles.css"), "utf8");

for (const file of readdirSync(ui).filter(name => name.endsWith(".js"))) {
  const source = readFileSync(join(ui, file), "utf8");
  try {
    new Function(source);
  } catch (error) {
    failures.push(`${file}: sözdizimi hatası — ${error.message}`);
  }
}

const ids = new Set([
  ...[...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]),
  ...[...js.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)].map(match => match[1]),
]);
const lookups = new Set([...js.matchAll(/\$\(\s*"#([A-Za-z0-9_-]+)"\s*\)/g)].map(match => match[1]));
for (const id of lookups) {
  if (!ids.has(id)) failures.push(`index.html: #${id} kimliği eksik (app.js içinde aranıyor)`);
}

let open = 0;
let close = 0;
for (const char of css) {
  if (char === "{") open += 1;
  if (char === "}") close += 1;
}
if (open !== close) failures.push(`styles.css: süslü parantez dengesi bozuk (${open} açık, ${close} kapalı)`);

const cssClasses = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map(match => match[1]));
const htmlClasses = new Set(
  [...html.matchAll(/\sclass="([^"]*)"/g)]
    .flatMap(match => match[1].split(/\s+/))
    .filter(Boolean),
);
for (const name of htmlClasses) {
  if (!cssClasses.has(name) && !name.includes("${")) {
    failures.push(`styles.css: .${name} sınıfı tanımlı değil (index.html kullanıyor)`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`✕ ${failure}`);
  process.exit(1);
}

console.log(`✓ UI wiring ok — ${lookups.size} id, ${htmlClasses.size} sınıf, ${cssClasses.size} CSS sınıfı`);
