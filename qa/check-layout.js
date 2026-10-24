#!/usr/bin/env node
'use strict';
/**
 * Layout/env gate that runs with no browser and no network.
 *
 * It exists because of one specific history: 35 of these scripts used to hard-code an
 * absolute path to a chrome.exe inside one user's home directory. Every one of them
 * worked on the machine it was written on and died everywhere else, and nothing noticed,
 * because the only thing that could notice was a run on a different machine - which is
 * exactly what CI is.
 *
 * So the fix is not "delete the strings once". The fix is this invariant, asserted:
 *
 *   (1) a script that touches Chromium must get the executable from qa/chromium.js;
 *   (2) no tracked text file may name an absolute Windows user path;
 *   (3) every `qa/*.js` named by a package.json script must exist.
 *
 * The check is deliberately offline: probe-*.js need a live page and a real browser, so
 * they cannot run here. Syntax and the resolver invariant do not.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const QA = path.join(ROOT, 'qa');
const RESOLVER = path.join(QA, 'chromium.js');

const fails = [];
const notes = [];

// ---------- (1) every Chromium launcher goes through the one resolver ----------
// Signal, not the bare word: fx-source.js legitimately discusses Chromium in prose about
// how shadowBlur behaves, and flagging documentation is how a gate earns being ignored.
// The signals below only appear in code that actually runs a browser.
const LAUNCH_SIGNAL = /--headless|chrome\.exe|executablePath|puppeteer\s*\.\s*launch|playwright|chromium\s*\.\s*launch/i;
const REQUIRES_RESOLVER = /require\(\s*['"](?:\.\/|\.\.\/qa\/)chromium(?:\.js)?['"]\s*\)/;

const qaFiles = fs.readdirSync(QA).filter((f) => f.endsWith('.js')).sort();
for (const f of qaFiles) {
  const full = path.join(QA, f);
  if (full === RESOLVER || full === __filename) continue;  // the resolver IS the answer; this file is the gate
  const src = fs.readFileSync(full, 'utf8');
  if (!LAUNCH_SIGNAL.test(src)) continue;
  if (!REQUIRES_RESOLVER.test(src)) {
    fails.push(
      'qa/' + f + ' launches a browser but does not require ./chromium - a hard-coded ' +
      'executable path works on exactly one machine (this is the regression this gate exists for)'
    );
  }
}
notes.push(qaFiles.length + ' qa scripts scanned');

// ---------- (2) no absolute Windows user path anywhere tracked ----------
// One deliberate exception, named so it cannot grow into a habit: chromium.js holds the
// old install path on purpose, as the LAST candidate it tries. That is the fallback that
// makes an unconfigured machine still work; it is not a copy-paste template.
const ABS_PATH_ALLOWED = new Map([
  ['qa/chromium.js', 'keeps the legacy install path as its documented last-resort fallback'],
]);

const SKIP_DIRS = new Set(['node_modules', '.git', '.github']);
const TEXT_EXT = new Set(['.js', '.cjs', '.mjs', '.json', '.html', '.css', '.md', '.sh', '.yml', '.yaml', '.txt']);
// Built from parts so this file does not match its own scan.
const ABS_WIN = new RegExp('[A-Za-z]:[\\\\/]{1,2}Users[\\\\/][^\\s"\']+');

let scanned = 0;
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!TEXT_EXT.has(path.extname(name).toLowerCase())) continue;
    scanned++;
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (ABS_PATH_ALLOWED.has(rel)) continue;
    const src = fs.readFileSync(full, 'utf8');
    const m = ABS_WIN.exec(src);
    if (m) {
      fails.push(
        rel + ' pins an absolute machine path (' + m[0] + ') - use qa/chromium.js or an env var instead'
      );
    }
  }
})(ROOT);
notes.push(scanned + ' text files scanned for absolute paths');

// ---------- (3) package.json scripts must point at files that exist ----------
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let wired = 0;
for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
  for (const m of String(cmd).matchAll(/\bqa\/[A-Za-z0-9._-]+\.js\b/g)) {
    wired++;
    if (!fs.existsSync(path.join(ROOT, m[0]))) {
      fails.push('package.json script "' + name + '" runs ' + m[0] + ', which does not exist');
    }
  }
}
notes.push(wired + ' script targets resolved');

for (const n of notes) console.log('ok   ' + n);
for (const f of fails) console.log('FAIL ' + f);
console.log(fails.length + ' problem(s)');
process.exit(fails.length ? 1 : 0);
