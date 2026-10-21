const MS = require("../../extension/src/core/engine.js"); require("../../extension/src/core/learner.js");
let bad = 0; const ok = (name, cond) => { if (!cond) bad++; console.log((cond ? "ok   " : "FAIL ") + name); };
// URL allow-list: notification clicks and push links may only ever open Gmail / Yahoo Mail
ok("gmail url allowed", MS.safeUrl("https://mail.google.com/mail/u/0/#inbox") !== "");
ok("yahoo url allowed", MS.safeUrl("https://mail.yahoo.com/d/folders/1") !== "" && MS.safeUrl("https://eu.mail.yahoo.com/n") !== "");
["http://mail.google.com/x", "https://evil.com/mail.google.com", "https://mail.google.com.evil.com/", "javascript:alert(1)", "data:text/html,hi", "https://notmail.yahoo.com.attacker.io", "", "garbage"].forEach(u => ok("blocked: " + u, MS.safeUrl(u) === ""));
// message cleaning: oversize / wrong types / hostile url
const c = MS.cleanItem({ from_addr: "a".repeat(5000), subject: { x: 1 }, snippet: null, url: "https://evil.com", unread: "yes", id: 12345 });
ok("long field trimmed", c.from_addr.length === 200); ok("object subject becomes string", typeof c.subject === "string"); ok("hostile url dropped", c.url === ""); ok("flags are booleans", c.unread === true && c.has_attachment === false);
// html in an email stays text for the engine (nothing is ever interpreted as markup by the engine)
const m = MS.build({ from_name: "<img src=x onerror=alert(1)>", from_addr: "x@y.com", subject: "<script>alert(1)</script>", snippet: "" });
ok("markup kept as inert text", m.subject.includes("<script>") && !/[<>]/.test(m.source));
// presets
const S = MS.merge(MS.DEFAULTS, {}); MS.applyPreset(S, "student"); MS.validate(S);
ok("preset adds its rule once", S.rules.filter(r => r.name === "preset: study mail").length === 1);
MS.applyPreset(S, "student"); ok("applying again does not duplicate", S.rules.filter(r => r.name === "preset: study mail").length === 1);
ok("preset classifies", MS.classify(MS.build({ from_name: "IIT Patna", from_addr: "office@iitp.ac.in", subject: "Exam timetable released" }), S).category === "Study");
// rule packs
const S2 = MS.merge(MS.DEFAULTS, {}); const pack = MS.packExport(S, "x");
ok("pack imports rules", MS.packImport(S2, JSON.parse(JSON.stringify(pack))) === 1 && MS.packImport(S2, pack) === 0);
let threw = false; try { MS.packImport(S2, { rules: "x" }); } catch (e) { threw = true; } ok("bad pack rejected", threw);
threw = false; try { const bp = MS.merge(MS.DEFAULTS, {}); MS.packImport(bp, { mailsortPack: 1, rules: [{ name: "bad", when: { nonsense: 1 }, category: "X" }] }); MS.validate(bp); } catch (e) { threw = true; } ok("pack with unknown condition fails validation", threw);
// settings validation for new fields
threw = false; try { MS.validate(MS.merge(MS.DEFAULTS, { notifications: { digest: { enabled: true, time: "late" } } })); } catch (e) { threw = true; } ok("bad digest time rejected", threw);
threw = false; try { MS.validate(MS.merge(MS.DEFAULTS, { notifications: { ntfy: { detail: "everything" } } })); } catch (e) { threw = true; } ok("bad push detail rejected", threw);
// Hinglish / Hindi through the learner
const brain = new MS.Brain(); const set = MS.merge(MS.DEFAULTS, {});
[["Shopping", "Meesho Care", "care@meesho-mail.in", "Aapka order bhej diya gaya hai", "Kal tak pahunch jayega"],
 ["Finance", "Bank Alerts", "alerts@mybank.in", "Aapke account se paise kat gaye", "Rs 500 debit"],
 ["Personal", "Papa", "papa@example.com", "Aaj shaam ko milte hain", "Khana kha liya?"],
 ["Promotions", "Offers", "hello@store.in", "Aaj hi kharidein, khaas offer sirf aapke liye", "Bumper sale"],
 ["Security", "Account", "no-reply@service.in", "आपका ओटीपी", "Share mat karna"]].forEach(([want, n, a, s, sn]) => {
  const r = MS.classify(MS.build({ from_name: n, from_addr: a, subject: s, snippet: sn }), set, brain); ok("Hinglish/Hindi " + want + " -> " + r.category, r.category === want); });
process.exit(bad ? 1 : 0);
