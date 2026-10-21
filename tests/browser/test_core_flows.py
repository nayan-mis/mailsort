import tempfile, time, json
from playwright.sync_api import sync_playwright
from mockmail import page_html, row, ROWS as BASE_ROWS
ROWS = BASE_ROWS + [("noreply@cleartrip.com","Cleartrip","Your trip to Goa is confirmed","Booking reference ABC123")]
import os
EXT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "extension"))
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(SHOTS, exist_ok=True)
def S(sw): return sw.evaluate("chrome.storage.local.get('settings')")["settings"]
res = []
def check(name, cond): res.append(cond); print(("ok   " if cond else "FAIL ") + name)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=False, args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--no-sandbox"], viewport={"width":1280,"height":800})
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    for _ in range(100):   # the worker is listed before its scripts have finished loading
        if sw.evaluate('typeof MS') == 'object': break
        time.sleep(0.1)
    sw.evaluate("MS.mutate(s => { s.notifications.desktop = true; s.gmail.feed = false; })")
    page = ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.route("https://mail.google.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body=page_html(ROWS)))
    page.on("dialog", lambda d: d.accept("Food"))
    page.goto("https://mail.google.com/mail/u/0/#inbox"); page.wait_for_selector(".ms-badge"); time.sleep(1.2)

    # 1. first-run card
    check("first-run card appears", page.locator("#ms-welcome").count() == 1)
    n_rows = page.locator("#ms-welcome .ms-w-row").count(); check("card shows 3-4 sample rows (%d)" % n_rows, 3 <= n_rows <= 4)
    page.screenshot(path=SHOTS + "/5-first-run-check.png")
    page.locator("#ms-welcome .ms-w-row").nth(0).locator("button").nth(0).click(); time.sleep(0.2)
    check("tick removes the row", page.locator("#ms-welcome .ms-w-row").count() == n_rows - 1)
    target = page.locator("#ms-welcome .ms-w-row").nth(0).locator(".ms-w-txt b").inner_text()
    page.locator("#ms-welcome .ms-w-row").nth(0).locator("button").nth(1).click(); time.sleep(0.8)
    check("cross + category creates an override", len(S(sw)["senders"]) == 1)
    check("undo toast shown", page.locator("#ms-toast").count() == 1 and "Undo" in page.inner_text("#ms-toast"))
    page.click("#ms-toast button"); time.sleep(0.6)
    check("undo removes the override", len(S(sw)["senders"]) == 0)
    page.click("#ms-welcome button.on"); time.sleep(0.5)
    check("done is remembered", S(sw)["onboarding"]["done"] is True and page.locator("#ms-welcome").count() == 0)
    page.reload(); page.wait_for_selector(".ms-badge"); time.sleep(1.5)
    check("no card after done + reload", page.locator("#ms-welcome").count() == 0)

    # 2. keyboard + aria
    b = page.locator(".ms-badge").first
    check("badge has role and aria-label", b.get_attribute("role") == "button" and "mailsort" in (b.get_attribute("aria-label") or ""))
    b.focus(); page.keyboard.press("Enter"); time.sleep(0.3)
    check("Enter opens the menu", page.locator("#ms-menu").count() == 1)
    page.keyboard.press("Escape"); time.sleep(0.2); check("Escape closes it", page.locator("#ms-menu").count() == 0)
    check("filter chips expose pressed state", page.locator("#ms-bar button[aria-pressed='true']").count() >= 1)

    # 3. confirm a guess
    guess = page.locator("tr.zA", has_text="Goa").locator(".ms-badge"); txt = guess.inner_text()
    guess.click(); time.sleep(0.2)
    has_confirm = page.locator("#ms-menu button[data-k='confirm']").count() == 1
    check("guessed mail (%s) offers 'Yes, it's ...'" % txt, has_confirm)
    if has_confirm: page.click("#ms-menu button[data-k='confirm']"); time.sleep(0.4); check("confirm thanks the user", "remember" in page.inner_text("#ms-toast"))
    time.sleep(7)
    st = sw.evaluate("chrome.storage.local.get('stats')")["stats"]; check("accuracy counters saved (%s)" % st, st["decisions"] >= 8 and st["corrections"] >= 1)
    check("no page errors", errs == []); 

    # 4. push privacy: capture what would leave the device
    sw.evaluate("""() => { globalThis.__sent = []; const real = globalThis.fetch; globalThis.fetch = (u, o) => { if (String(u).includes('ntfy.example')) { __sent.push({u: String(u), body: o.body, h: o.headers}); return Promise.resolve(new Response('ok')); } return real(u, o); }; }""")
    sw.evaluate("MS.mutate(s => { s.notifications.ntfy.topic = 'secret-topic'; s.notifications.ntfy.server = 'https://ntfy.example'; s.notifications.only_senders = ['vip@x.com']; s.notifications.desktop = false; })")
    item = {"from_addr": "vip@x.com", "from_name": "Rahul", "subject": "Salary slip for September", "snippet": "confidential", "unread": True}
    for detail, want in [("sender", "New email"), ("none", "New important email"), ("full", "Salary slip for September")]:
        sw.evaluate("MS.mutate(s => { s.notifications.ntfy.detail = '%s'; })" % detail)
        sw.evaluate("chrome.storage.session.clear()")
        sw.evaluate("handleItem(%s)" % json.dumps(dict(item, subject=item["subject"] + (" " + detail if detail == "full" else ""))))
        time.sleep(0.5)
        sent = sw.evaluate("__sent.pop()"); got = sent["body"] if sent else None
        check("push detail=%s -> %r" % (detail, got), got is not None and (got == want or (detail == "full" and want in got)) and "Salary" not in (got if detail != "full" else ""))
    sw.evaluate("chrome.storage.session.clear()")
    sw.evaluate("handleItem(%s)" % json.dumps(dict(item, subject="link test", url="https://evil.com/phish")))
    time.sleep(0.5); sent = sw.evaluate("__sent.pop()"); check("hostile link never reaches the push", sent is not None and "Click" not in sent["h"])
    sw.evaluate("chrome.storage.session.clear()")
    sw.evaluate("handleItem(%s)" % json.dumps(dict(item, subject="good link", url="https://mail.google.com/mail/u/0/#inbox/abc")))
    time.sleep(0.5); sent = sw.evaluate("__sent.pop()"); check("Gmail link is kept", sent is not None and sent["h"].get("Click", "").startswith("https://mail.google.com/"))

    # 5. daily digest
    sw.evaluate("MS.mutate(s => { s.notifications.digest.enabled = true; s.notifications.desktop = true; s.notifications.ntfy.topic = ''; })")
    sw.evaluate("chrome.storage.local.remove('digestQueue'); chrome.storage.session.clear()")
    for i, subj in enumerate(["Flash sale 70% off shoes", "Big sale on phones today"]):
        sw.evaluate("handleItem(%s)" % json.dumps({"from_addr": "offers@flipkart.com", "from_name": "Flipkart", "subject": subj, "snippet": "Unsubscribe", "unread": True}))
    time.sleep(0.6); q = sw.evaluate("chrome.storage.local.get('digestQueue')")["digestQueue"]
    check("muted mail is queued for the digest %s" % q, q["total"] == 2 and q["counts"].get("Promotions") == 2)
    before = len(sw.evaluate("new Promise(r => chrome.notifications.getAll(r))")); sw.evaluate("sendDigest()"); time.sleep(0.6)
    after = len(sw.evaluate("new Promise(r => chrome.notifications.getAll(r))")); q2 = sw.evaluate("chrome.storage.local.get('digestQueue')")["digestQueue"]
    check("one digest notification, queue cleared", after == before + 1 and q2["total"] == 0)

    # 6. options page: presets, pack, your data
    op = ctx.new_page(); errs2 = []; op.on("pageerror", lambda e: errs2.append(str(e)))
    ext_id = sw.url.split("/")[2]; op.goto(f"chrome-extension://{ext_id}/src/pages/options.html"); time.sleep(0.5)
    op.click("nav button[data-k='rules']"); time.sleep(0.2); op.click("button[data-act='preset'][data-k='founder']"); time.sleep(0.6)
    check("preset applied from the options page", any(r["name"] == "preset: investors and board" for r in S(sw)["rules"]))
    op.click("nav button[data-k='rules']")
    with op.expect_download() as dl: op.click("button[data-act='pack_export']")
    pack = json.load(open(dl.value.path())); check("rules pack downloads as data", pack.get("mailsortPack") == 1 and len(pack["rules"]) >= 1)
    op.click("nav button[data-k='display']"); time.sleep(0.2)
    check("'Your data' card and accuracy line render", "Your data" in op.inner_text("#main") and "accuracy" in op.inner_text("#main").lower())
    op.screenshot(path=SHOTS + "/6-your-data-and-learning.png")
    op.on("dialog", lambda d: d.accept()); op.click("button[data-act='wipe_all']"); time.sleep(0.6)
    check("delete everything clears storage", sw.evaluate("chrome.storage.local.get(null)") == {} or list(sw.evaluate("chrome.storage.local.get(null)").keys()) in ([], ["stats"]))
    check("options page has no errors", errs2 == [])
    ctx.close()
print("\n%d/%d checks passed" % (sum(res), len(res)))
