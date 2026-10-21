// Fails the build if the extension could leak data, or if the repository contains personal details.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "..");
let bad = 0;
const ok = (name, cond, detail) => { if (!cond) bad++; console.log((cond ? "ok   " : "FAIL ") + name + (!cond && detail ? "  -> " + detail : "")); };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === "node_modules" || e.name === "dist" || e.name === "shots" || e.name === ".git" ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const ext = path.join(root, "extension");
const extFiles = walk(ext).filter(f => /\.(js|html|json|css)$/.test(f));
const read = f => fs.readFileSync(f, "utf8");
const rel = f => path.relative(root, f);

// 1. manifest: smallest possible permissions, nothing exposed to web pages
const m = JSON.parse(read(path.join(ext, "manifest.json")));
ok("permissions are exactly storage, notifications, alarms, offscreen (hidden page for the optional model)", JSON.stringify([...m.permissions].sort()) === JSON.stringify(["alarms", "notifications", "offscreen", "storage"]), JSON.stringify(m.permissions));
const hostOk = h => /^https:\/\/(mail\.google\.com|mail\.yahoo\.com|\*\.mail\.yahoo\.com)\/\*$/.test(h);
ok("host permissions only Gmail and Yahoo Mail", m.host_permissions.every(hostOk), JSON.stringify(m.host_permissions));
ok("optional hosts limited to the user-approved push server", JSON.stringify(m.optional_host_permissions) === JSON.stringify(["https://*/*"]));
ok("not reachable from web pages or other extensions", !m.externally_connectable && !m.web_accessible_resources);
ok("strict content security policy: own scripts only, WebAssembly allowed for the optional model, no eval", (m.content_security_policy || {}).extension_pages === "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'", JSON.stringify(m.content_security_policy));
ok("content scripts run only on mail sites", m.content_scripts.every(c => c.matches.every(hostOk)));

// 2. code: no hidden channels, no dynamic code, no remote scripts
const all = extFiles.map(f => [rel(f), read(f)]);
const hits = (re) => all.filter(([n, t]) => re.test(t)).map(([n]) => n);
ok("no XMLHttpRequest / WebSocket / sendBeacon / EventSource", hits(/XMLHttpRequest|WebSocket|sendBeacon|EventSource/).length === 0, hits(/XMLHttpRequest|WebSocket|sendBeacon|EventSource/).join());
ok("no eval / new Function / document.write", hits(/\beval\(|new Function\(|document\.write\(/).length === 0, hits(/\beval\(|new Function\(|document\.write\(/).join());
const fetchFiles = hits(/\bfetch\(/);
ok("fetch() appears only in the background worker and the hidden model page", fetchFiles.every(n => n.endsWith("background.js") || n.endsWith("ai/offscreen.js")), fetchFiles.join());
const bg = read(path.join(ext, "src", "background", "background.js")), off = read(path.join(ext, "src", "ai", "offscreen.js"));
const netCalls = (bg.match(/\bfetch\(/g) || []).length;
ok("exactly two network call sites (Gmail feed, optional push server)", netCalls === 2, String(netCalls));
ok("the hidden model page only ever fetches its own files", (off.match(/\bfetch\(/g) || []).length === (off.match(/fetch\(chrome\.runtime\.getURL\(/g) || []).length);
const runner = read(path.join(ext, "src", "ai", "backend-transformers.js"));
ok("the model runner is forbidden from downloading models", /allowRemoteModels\s*=\s*false/.test(runner));
ok("no dynamic import or worker from a web address", hits(/import\(\s*["'`]https?:|new Worker\(\s*["'`]https?:|importScripts\(\s*["'`]https?:/).length === 0);
ok("only the extension's own pages can reach the model host", /sender\.id\s*!==\s*chrome\.runtime\.id/.test(off) && /sender\.id\s*!==\s*chrome\.runtime\.id/.test(bg));
ok("content script and popup never use innerHTML", !/innerHTML/.test(read(path.join(ext, "src", "content", "content.js"))) && !/innerHTML/.test(read(path.join(ext, "src", "pages", "popup.js"))));
ok("options page uses innerHTML in one place only", (read(path.join(ext, "src", "pages", "options.js")).match(/innerHTML/g) || []).length <= 2);
ok("no remote <script> or stylesheet in any page", hits(/<(script|link)[^>]+(src|href)=["']https?:/).length === 0);
const allowedHosts = new Set(["mail.google.com", "mail.yahoo.com", "ntfy.sh", "schemas.google.com", "www.w3.org"]);
const urls = new Set(); all.forEach(([n, t]) => (t.match(/https?:\/\/[A-Za-z0-9.*-]+/g) || []).forEach(u => urls.add(u.replace(/^https?:\/\//, ""))));
const stray = [...urls].filter(h => !allowedHosts.has(h) && !h.startsWith("*") && !h.endsWith(".mail.yahoo.com"));
ok("every web address in the code is on the allow-list", stray.length === 0, stray.join());

// 3. repository hygiene: nothing personal or secret
const text = walk(root).filter(f => /\.(js|py|json|md|html|css|yml|yaml|sh|txt)$/.test(f));
const personalMail = /[A-Za-z0-9._%+-]+@(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|icloud|proton|protonmail|rediffmail)\.[a-z.]+/i;
const leaks = text.filter(f => personalMail.test(read(f)) && !f.endsWith("privacy-audit.test.js"));
ok("no personal-looking mailbox addresses", leaks.length === 0, leaks.map(rel).join());
const paths = text.filter(f => /(\/home\/[a-z]|\/Users\/[A-Za-z]|C:\\Users\\|\/tmp\/ext)/.test(read(f)) && !f.endsWith("privacy-audit.test.js"));
ok("no local file paths", paths.length === 0, paths.map(rel).join());
const keys = text.filter(f => /-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[abp]-[0-9A-Za-z-]{10,}|sk-[A-Za-z0-9]{20,}/.test(read(f)) && !f.endsWith("privacy-audit.test.js"));
ok("no private keys or access tokens", keys.length === 0, keys.map(rel).join());
process.exit(bad ? 1 : 0);
