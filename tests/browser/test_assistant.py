import tempfile, time, re, json
from playwright.sync_api import sync_playwright
from mockmail import page_html, row, ROWS as BASE_ROWS
import os
EXT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "extension"))
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(SHOTS, exist_ok=True)
ROWS = BASE_ROWS + [("deals@flipkart.com", "Flipkart", "Big Billion sale starts now", "Unsubscribe"), ("jobs@linkedin.com", "LinkedIn", "5 new jobs for you", "See jobs"), ("no-reply@swiggy.in", "Swiggy", "Late night cravings?", "Order food now")]
def mock(rows):
    h = page_html(rows)
    h = re.sub(r'(<tr class="zA[^"]*">)', r'\1<td class="oZ-x3"><div role="checkbox" aria-checked="false" style="width:14px;height:14px;border:1px solid #888;display:inline-block"></div></td>', h)
    return h.replace("</body>", "<script>window.__keys=0;document.addEventListener('keydown',()=>window.__keys++);document.addEventListener('click',e=>{const c=e.target.closest('[role=checkbox]');if(c)c.setAttribute('aria-checked',c.getAttribute('aria-checked')==='true'?'false':'true')})</script></body>")
res = []
def check(name, cond, extra=""): res.append(bool(cond)); print(("ok   " if cond else "FAIL ") + name + ("" if cond or not extra else "  -> " + str(extra)))
def S(sw): return sw.evaluate("chrome.storage.local.get('settings')")["settings"]
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=False, args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--no-sandbox"], viewport={"width":1280,"height":800})
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    for _ in range(100):   # the worker is listed before its scripts have finished loading
        if sw.evaluate('typeof MS') == 'object': break
        time.sleep(0.1)
    sw.evaluate("MS.mutate(s => { s.onboarding.done = true; s.gmail.feed = false; })")
    page = ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e))); page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.route("https://mail.google.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body=mock(ROWS)))
    page.goto("https://mail.google.com/mail/u/0/#inbox"); page.wait_for_selector(".ms-badge"); time.sleep(2)
    def say(text):
        n = page.locator(".ms-c-bot").count(); page.fill("#ms-chat input", text); page.keyboard.press("Enter")
        t0 = time.time()
        while page.locator(".ms-c-bot").count() <= n and time.time() - t0 < 5: time.sleep(0.1)
        time.sleep(0.5); return page.locator(".ms-c-bot").last.inner_text()
    check("assistant button is on the page", page.locator("#ms-chat-btn").count() == 1)
    page.click("#ms-chat-btn"); time.sleep(0.3)
    check("panel opens with a greeting and focused input", page.locator("#ms-chat").count() == 1 and "Hi!" in page.locator(".ms-c-bot").first.inner_text() and page.evaluate("document.activeElement && document.activeElement.closest('#ms-chat') !== null"))
    page.screenshot(path=SHOTS + "/chat_open.png")

    r = say("Mute linkedin and notify me only for rahul.sharma@example.com")
    st = S(sw)["notifications"]
    check("two instructions in one sentence applied", st["mode"] == "only" and "@linkedin.com" in st["mute_senders"] and "rahul.sharma@example.com" in st["only_senders"], st)
    check("reply says what it did, with an Undo button", "Muted" in r and page.locator(".ms-c-undo").count() == 1, r)
    page.locator(".ms-c-undo").last.click(); time.sleep(0.8)
    st = S(sw)["notifications"]; check("Undo restores the previous settings", st["mode"] == "rules" and st["mute_senders"] == [] and st["only_senders"] == [], st)

    r = say("If the subject contains invoice, make it Finance and tag it bills"); rules = S(sw)["rules"]
    check("keyword rule created from a sentence", len(rules) == 1 and rules[0]["category"] == "Finance" and rules[0]["tags"] == ["bills"], rules)
    check("'list my rules' shows it", "Finance" in say("list my rules"))
    say("Move swiggy to Food/Delivery and don't notify me"); ov = S(sw)["senders"]
    check("sender override created", ov.get("@swiggy.in", {}).get("category") == "Food" and ov["@swiggy.in"]["notify"] is False, ov)
    time.sleep(1.2); check("the Swiggy badge on the page changed", "Food" in page.locator("tr.zA", has_text="Late night").locator(".ms-badge").inner_text() if page.locator("tr.zA", has_text="Late night").count() else True)

    r = say("show promotions"); time.sleep(0.8)
    vis = page.eval_on_selector_all("tr.zA", "els => els.filter(e => e.style.display !== 'none').length"); check("'show promotions' filters the list (%d visible)" % vis, 1 <= vis < len(ROWS))
    say("show all"); time.sleep(0.8); check("'show all' restores it", page.eval_on_selector_all("tr.zA", "els => els.filter(e => e.style.display !== 'none').length") == len(ROWS))
    r = say("select all from flipkart"); ticked = page.locator("[role=checkbox][aria-checked=true]").count()
    check("'select all from flipkart' ticks the right rows (%d)" % ticked, ticked == 2 and "Selected 2" in r, r)
    say("unselect"); check("'unselect' clears them", page.locator("[role=checkbox][aria-checked=true]").count() == 0)
    r = say("delete all from flipkart"); check("'delete' only selects and says it never deletes", "never delete" in r and page.locator("[role=checkbox][aria-checked=true]").count() == 2 and page.locator("tr.zA").count() == len(ROWS), r)
    say("unselect")
    before = S(sw)["notifications"]["mute_senders"][:]; r = say("mute gmail.com")
    check("refuses to mute a whole mail provider", "mail provider" in r and S(sw)["notifications"]["mute_senders"] == before, r)
    r = say("blorp the gizmo"); check("unknown sentence gets help, not a guess", "did not understand" in r and "help" in r.lower())

    page.evaluate("window.__keys = 0"); page.fill("#ms-chat input", "j"); page.keyboard.type("kn")
    check("typing in the box does not trigger page shortcuts", page.evaluate("window.__keys") == 0, page.evaluate("window.__keys"))
    page.fill("#ms-chat input", "")
    r = say("<img src=x onerror=window.__pwned=1>")
    check("hostile text in a command stays inert", page.locator("#ms-chat img").count() == 0 and page.evaluate("window.__pwned") is None and "<img" in page.locator(".ms-c-user").last.inner_text())
    page.screenshot(path=SHOTS + "/chat_convo.png")
    page.keyboard.press("Escape"); time.sleep(0.3); check("Escape closes the panel", page.locator("#ms-chat").count() == 0)
    check("no page errors", errs == [], errs)
    ctx.close()
print("\n%d/%d checks passed" % (sum(res), len(res)))
