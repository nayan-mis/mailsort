const MS = require("../../extension/src/core/engine.js"); require("../../extension/src/core/learner.js");
const S = MS.merge(MS.DEFAULTS, {});
// held-out test mails: senders and wording NOT used in the seed or built-in rules; label = what a person would call it
const T = [
 ["Shopping","Lenskart","care@lenskart.com","We've received your purchase of Aviator Frames","Your frames will be dispatched in 2 days"],
 ["Shopping","Boat Lifestyle","support@boat-lifestyle.com","Your parcel has left our warehouse","Track it with the link"],
 ["Shopping","Zepto","orders@zeptonow.com","Your groceries will reach you in 10 minutes","Rider is on the way"],
 ["Travel","Cleartrip","noreply@cleartrip.com","Your trip to Goa is confirmed","Booking reference ABC123"],
 ["Travel","Vistara","alerts@airvistara.com","Gate change for your journey to Delhi","Now boarding from gate 14"],
 ["Travel","Ola","noreply@olacabs.in","Your cab is arriving in 3 minutes","Driver Ramesh KA01"],
 ["Jobs","Internshala","alerts@internshala.com","New roles matching your profile","Apply before they close"],
 ["Jobs","Priya (Acme HR)","priya@acmehr.com","Next steps after your technical round","We would like to move you forward"],
 ["Jobs","Foundit","mail@foundit.in","Employers viewed your resume this week","Update your profile to get noticed"],
 ["Finance","Groww","no-reply@groww.in","Your SIP of Rs 5,000 was successful","Units allotted at NAV"],
 ["Finance","CRED","hello@cred.club","Your credit limit has been increased","New limit is available now"],
 ["Finance","Zerodha","no-reply@zerodha.com","Contract note for 07-Oct","Please find the attached note"],
 ["Security","Dropbox","no-reply@dropbox.com","Someone tried to access your account from a new browser","Was this you?"],
 ["Security","Notion","team@mail.notion.so","Your login link","Click to sign in, expires in 10 minutes"],
 ["Developer","Linear","notifications@linear.app","Priya assigned you ENG-241","Fix flaky checkout test"],
 ["Developer","Postman","team@postman.com","Your API monitor found 3 failing runs","Production collection"],
 ["Developer","Railway","notifications@railway.app","Your service crashed and was restarted","Check the logs"],
 ["Work","Rohit Kumar","rohit@startup.io","Q3 roadmap review notes","Action items inside, please review before Thursday"],
 ["Work","Slack","feedback@slack.com","You have 5 unread messages in general","Catch up on your workspace"],
 ["Work","Anita Rao","anita@clientco.com","Feedback on the proposal deck","A few changes to pricing slide"],
 ["Social","Threads","no-reply@threads.net","Aman replied to your post","See the conversation"],
 ["Social","Strava","no-reply@strava.com","Karan gave you kudos for your morning run","See who else liked it"],
 ["Social","Goodreads","hello@goodreads.com","3 friends rated books this week","See their reviews"],
 ["Promotions","Dominos","offers@dominos.co.in","Buy 1 get 1 on medium pizzas this weekend","Order now"],
 ["Promotions","Lifestyle","news@lifestylestores.com","End of season: up to 60% extra on fashion","Shop the festive edit"],
 ["Promotions","Pepperfry","hello@pepperfry.com","Your wishlist item just dropped in price","Grab it before stock runs out"],
 ["Subscriptions","The Ken","newsletter@the-ken.com","The Monday Brief: markets, startups and more","Read online | Unsubscribe"],
 ["Subscriptions","Stratechery","email@stratechery.com","This week's article on aggregation","Unsubscribe | Manage preferences"],
 ["Subscriptions","Lenny's Newsletter","lenny@substack.com","How top PMs run planning","Read in browser"],
 ["Spam","Dr Mark","mark@lucky-draw.top","You have been picked for a special cash reward","Reply with your bank details to receive funds"],
 ["Spam","Online Pharmacy","deals@cheap-meds.click","Cheap tablets, no prescription needed","Order today"],
 ["Personal","Rahul","rahul@example.com","Are we still on for dinner tonight","Let me know"],
 ["Personal","Mom","mom@example.net","Did you reach home safely","Call me when you can"],
 ["Personal","Papa","papa@example.com","Kal shaam ko ghar aa jao","Sab log aa rahe hain"],
 ["Personal","Neha","neha.s@example.com","Photos from Sunday","Sending the album link"],
];
const brain = new MS.Brain();
let r0 = 0, r1 = 0; const rows = [];
for (const [want, name, addr, subj, snip] of T) {
  const m = MS.build({ from_name: name, from_addr: addr, subject: subj, snippet: snip });
  const a = MS.classify(m, S), b = MS.classify(m, S, brain);
  r0 += a.category === want; r1 += b.category === want;
  rows.push([want, a.category, b.category, b.reasons.filter(x => x.startsWith("learned")).join(), subj.slice(0, 38)]);
}
rows.forEach(r => console.log((r[2] === r[0] ? "ok  " : "MISS") + " want " + r[0].padEnd(13) + "rules-only " + r[1].padEnd(14) + "with learner " + r[2].padEnd(14) + r[3].padEnd(20) + r[4]));
console.log(`\nrules only: ${r0}/${T.length}   rules + learner: ${r1}/${T.length}`);
if (r1 < 22 || r1 <= r0) { console.log("FAIL: learner accuracy regressed"); process.exitCode = 1; }
// teaching from a correction
const m1 = MS.build({ from_name: "Swiggy Instamart", from_addr: "no-reply@swiggy.in", subject: "Your Instamart basket is waiting", snippet: "Complete your order" });
const before = brain.predict(m1);
for (let i = 0; i < 3; i++) brain.learn(MS.build({ from_name: "Swiggy", from_addr: "no-reply@swiggy.in", subject: "Dinner under 30 minutes " + i, snippet: "Order food now" }), "Food", 4, true);
const after = brain.predict(MS.build({ from_name: "Swiggy", from_addr: "no-reply@swiggy.in", subject: "Late night cravings", snippet: "Order food now" }));
console.log("before teaching:", before && before.label, "| after 3 corrections ->", after.label, after.p.toFixed(2));
const js = JSON.stringify(brain.toJSON()); const b2 = new MS.Brain(JSON.parse(js));
console.log("persisted delta size:", js.length, "bytes; reload predicts:", b2.predict(MS.build({ from_name: "Swiggy", from_addr: "no-reply@swiggy.in", subject: "Late night cravings", snippet: "Order food now" })).label);
const t0 = process.hrtime.bigint(); for (let i = 0; i < 500; i++) brain.predict(MS.build({ from_name: "x", from_addr: "a@b.com", subject: "Flash offer on shoes", snippet: "limited time" })); console.log("predict ms each:", (Number(process.hrtime.bigint() - t0) / 1e6 / 500).toFixed(3));
