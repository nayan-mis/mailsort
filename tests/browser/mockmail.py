"""A mock Gmail-style inbox page used by the browser tests. All senders are fictional."""

def row(i, addr, name, subj, snip, unread=True, att=False):
    return f'''<tr class="zA {'zE' if unread else 'yO'}"><td class="yX"><div class="yW"><span class="zF" email="{addr}" name="{name}">{name}</span></div></td>
<td class="xY"><div class="y6"><span data-thread-id="#thread-f:{i}" data-legacy-thread-id="t{i}"><span class="bog">{subj}</span></span><span class="y2"> - {snip}</span></div></td>
<td>{'<img alt="Attachment" src="data:,">' if att else ''}</td></tr>'''
ROWS = [
 ("alerts@hdfcbank.net","HDFC Bank Alerts","Your OTP is 482913","Do not share this code with anyone"),
 ("crew@morningbrew.com","Morning Brew","Your weekly digest","Unsubscribe | View in browser"),
 ("shipment-tracking@amazon.in","Amazon.in","Shipped: your order #123","Arriving Thursday"),
 ("winner@claim-now.xyz","Prize Dept","WINNER!!! CLAIM YOUR PRIZE NOW","Congratulations you have won. Click here to verify your account"),
 ("invitations@linkedin.com","LinkedIn","Priya wants to connect with you","See profile"),
 ("rahul.sharma@example.com","Rahul Sharma","lunch tomorrow?","Are you free around 1?"),
 ("offers@flipkart.com","Flipkart","Flash sale: 70% off on electronics","Unsubscribe"),
 ("notifications@github.com","GitHub","[repo] Run failed: CI - main","See details"),
]
def page_html(rows):
    body = "\n".join(row(i, *r) for i, r in enumerate(rows))
    return f'''<!doctype html><html><head><title>Inbox (3) - me@example.com - Gmail</title><style>body{{font-family:Arial;margin:0}}table{{width:100%;border-collapse:collapse}}td{{padding:6px 10px;border-bottom:1px solid #eee}}tr.zE{{font-weight:bold;background:#fff}}tr.yO{{background:#f2f6fc}}</style></head>
<body><div style="padding:10px;border-bottom:1px solid #ddd"><a aria-label="Google Account: Me (me@example.com)" href="#">Me</a></div><div role="main"><table><tbody id="list">{body}</tbody></table></div></body></html>'''

