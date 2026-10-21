import tempfile, time, json
from playwright.sync_api import sync_playwright
from mockmail import page_html, row, ROWS as BASE_ROWS
import os
EXT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "extension"))
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(SHOTS, exist_ok=True)
res = []
def check(name, cond): res.append(bool(cond)); print(("ok   " if cond else "FAIL ") + name)
EVIL = "<img src=x onerror=window.__pwned=1>"
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=False, args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--no-sandbox"], viewport={"width":1280,"height":800})
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    for _ in range(100):   # the worker is listed before its scripts have finished loading
        if sw.evaluate('typeof MS') == 'object': break
        time.sleep(0.1)
    ext_id = sw.url.split("/")[2]
    # 1. welcome page opens by itself after install (Playwright does not always list pages opened before it attached, so ask the browser)
    time.sleep(2)
    check("a second tab (the welcome page) was opened at install", sw.evaluate("chrome.tabs.query({}).then(t => t.length)") >= 2)
    welcome = ctx.new_page(); welcome.goto(f"chrome-extension://{ext_id}/src/pages/options.html#welcome"); time.sleep(0.5)
    check("welcome shows the 4 steps", welcome.locator(".steps li").count() == 4)
    welcome.screenshot(path=SHOTS + "/welcome.png")
    # a mail tab to reload
    rows = [("a@example.org", "Alice", "Lunch tomorrow?", "free at 1?")]
    gm = ctx.new_page(); gm.route("https://mail.google.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body=page_html(rows)))
    gm.goto("https://mail.google.com/mail/u/0/#inbox"); gm.wait_for_selector(".ms-badge")
    gm.evaluate("window.__marker = 1")
    welcome.bring_to_front(); welcome.click("button[data-act='reload_tabs']"); time.sleep(1.5)
    check("reload button reloads the open Gmail tab", gm.evaluate("window.__marker === undefined"))
    welcome.click("button[data-act='hide_welcome']"); time.sleep(0.3); check("'Got it' hides the welcome card", welcome.locator(".steps").count() == 0)

    # 2. unsaved-changes bar
    op = ctx.new_page(); op.goto(f"chrome-extension://{ext_id}/src/pages/options.html"); time.sleep(0.5)
    check("save bar hidden at first", op.locator("#savebar").is_hidden())
    op.check("input[name=mode][value=only]"); time.sleep(0.2)
    check("save bar appears after an edit", op.locator("#savebar").is_visible())
    op.screenshot(path=SHOTS + "/savebar.png")
    op.once("dialog", lambda d: d.dismiss()); op.click("nav button[data-k='senders']"); time.sleep(0.3)
    check("leaving with unsaved changes asks first (stay)", op.locator("nav button.on").inner_text() == "Notifications")
    op.click("#savebtn"); time.sleep(0.8)
    st = sw.evaluate("chrome.storage.local.get('settings')")["settings"]
    check("Save from the bar stores the change", st["notifications"]["mode"] == "only" and op.locator("#savebar").is_hidden())
    op.check("input[name=mode][value=all]"); op.once("dialog", lambda d: d.accept()); op.click("nav button[data-k='senders']"); time.sleep(0.3)
    check("accepting the prompt discards and switches tab", op.locator("nav button.on").inner_text() == "Senders" and sw.evaluate("chrome.storage.local.get('settings')")["settings"]["notifications"]["mode"] == "only")

    # 3. hostile data everywhere must stay inert in every extension page
    sw.evaluate("""(evil) => chrome.storage.local.set({ settings: { rules: [{ name: evil, when: { from: [evil] }, category: evil, subcategory: evil, tags: [evil] }],
        senders: { [evil]: { category: evil } }, notifications: { only_senders: [evil], mute_senders: [evil], notify_categories: [evil], mute_categories: [evil],
        ntfy: { topic: evil, server: 'https://ntfy.sh', detail: 'sender' }, digest: { enabled: false, time: '18:00' } }, spam: { blocked_senders: [evil], trusted_senders: [evil] } },
        status: { 0: { ok: false, error: evil, time: Date.now(), account: evil } } })""", EVIL)
    op.on("dialog", lambda d: d.dismiss())
    for tabk in ["notifications", "senders", "rules", "gmail", "display"]:
        op.reload(); time.sleep(0.4); op.click("nav button[data-k='%s']" % tabk); time.sleep(0.3)
        check("options/%s: no injected elements" % tabk, op.locator("img[src='x']").count() == 0 and op.evaluate("window.__pwned") is None)
    pp = ctx.new_page(); pp.goto(f"chrome-extension://{ext_id}/src/pages/popup.html"); time.sleep(0.6)
    check("popup: hostile status text stays inert", pp.locator("img").count() == 0 and pp.evaluate("window.__pwned") is None)
    check("popup says to open Gmail when not on a mail tab", "Open Gmail or Yahoo Mail" in pp.inner_text("#where"))
    pp.screenshot(path=SHOTS + "/popup.png")

    # 4. hostile e-mail text inside Gmail itself (escaped in the mock page, so it arrives as literal text)
    sw.evaluate("chrome.storage.local.clear()")
    esc = "&lt;img src=x onerror=window.__pwned=1&gt;"
    evil_rows = [("evil@example.org", esc, esc, esc), ("b@example.org", "Bob", "hi", "hello"), ("c@example.org", "Cara", "yo", "hey")]
    gm2 = ctx.new_page(); gm2.route("https://mail.google.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body=page_html(evil_rows)))
    gm2.on("dialog", lambda d: d.dismiss()); gm2.goto("https://mail.google.com/mail/u/0/#inbox"); gm2.wait_for_selector(".ms-badge"); time.sleep(1.2)
    gm2.locator(".ms-badge").first.click(); time.sleep(0.3)
    check("Gmail page: hostile sender/subject renders as text only", gm2.locator("#ms-welcome img, #ms-menu img, #ms-bar img, .ms-wrap img").count() == 0 and gm2.evaluate("window.__pwned") is None)
    check("the hostile text is still shown (as text)", "<img" in (gm2.inner_text("#ms-menu") + gm2.inner_text("#ms-welcome")))
    ctx.close()
print("\n%d/%d checks passed" % (sum(res), len(res)))
