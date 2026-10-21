const MS = require("../../extension/src/core/engine.js");
const S = MS.DEFAULTS;
const cases = [
 ["bank OTP", {from_name:"HDFC Bank Alerts",from_addr:"alerts@hdfcbank.net",subject:"Your OTP is 482913"}, "Security","Verification codes",true],
 ["newsletter", {from_name:"Morning Brew",from_addr:"crew@morningbrew.com",subject:"Your weekly digest",snippet:"Unsubscribe | View in browser"}, "Subscriptions","Morning Brew",false],
 ["order", {from_name:"Amazon.in",from_addr:"shipment-tracking@amazon.in",subject:"Shipped: your order #123"}, "Shopping","Orders",false],
 ["spam", {from_name:"Prize Dept",from_addr:"winner@claim-now.xyz",subject:"WINNER!!! CLAIM YOUR PRIZE NOW",snippet:"Congratulations you have won 1,000,000. Click here to verify your account"}, "Spam","Junk",false],
 ["social", {from_name:"LinkedIn",from_addr:"invitations@linkedin.com",subject:"Priya wants to connect with you"}, "Social","Linkedin",false],
 ["person", {from_name:"Rahul Sharma",from_addr:"rahul.sharma@example.com",subject:"lunch tomorrow?"}, "Personal","People",true],
 ["promo", {from_name:"Flipkart",from_addr:"offers@flipkart.com",subject:"Flash sale: 70% off on electronics"}, "Promotions","Offers",false],
 ["calendar", {from_name:"Google Calendar",from_addr:"calendar-notification@google.com",subject:"Invitation: Sprint planning @ Thu 3pm"}, "Work","Meetings",true],
 ["CI fail", {from_name:"GitHub",from_addr:"notifications@github.com",subject:"[repo] Run failed: CI - main"}, "Developer","Failures",true],
 ["bill due", {from_name:"Airtel",from_addr:"noreply@airtel.in",subject:"Your bill payment is due on 12 Oct"}, "Finance","Due",true],
 ["phishing", {from_name:"PayPal Support",from_addr:"help@secure-login.top",subject:"Your account has been limited",snippet:"Please verify your account: http://192.168.4.4/login"}, "Spam",null,false],
];
let bad=0;
for (const [n,raw,cat,sub,notify] of cases){ const r=MS.classify(MS.build(raw),S); const ok=r.category===cat&&(sub===null||r.subcategory===sub)&&r.notify_final===notify; if(!ok)bad++; console.log(n.padEnd(12),(r.category+"/"+r.subcategory).padEnd(34),String(r.notify_final).padEnd(6),ok?"ok":"FAIL want "+cat+"/"+sub+" "+notify, r.spam_score||""); }
const only = MS.merge(S,{notifications:{mode:"only",only_senders:["rahul.sharma@example.com"]}});
console.log("only VIP", MS.classify(MS.build(cases[5][1]),only).notify_final===true, "only OTP", MS.classify(MS.build(cases[0][1]),only).notify_final===false);
const ov = MS.merge(S,{senders:{"@amazon.in":{category:"Food",subcategory:"Delivery",notify:false,tags:["x"]}}});
const r=MS.classify(MS.build(cases[2][1]),ov); console.log("override", r.category, r.tags, r.notify_final);
const ar = MS.merge(S,{rules:[{name:"w",when:{account:["work@"],from:["vendor.com"]},category:"Work",subcategory:"Vendor"}]});
console.log("account rule", MS.classify(MS.build({from_addr:"a@vendor.com",from_name:"V",subject:"hi",account:"work@example.org"}),ar).category, MS.classify(MS.build({from_addr:"a@vendor.com",from_name:"V",subject:"hi",account:"me@example.com"}),ar).category);
console.log("validate bad:", (()=>{try{MS.validate(MS.merge(S,{rules:[{when:{nonsense:1}}]}))}catch(e){return e.message.slice(0,50)}})());
// atom
const atom=`<?xml version="1.0"?><feed version="0.3"><title>Gmail - Inbox for me@example.com</title><fullcount>2</fullcount><entry><title>Run failed &amp; more</title><summary>It&#39;s broken</summary><link rel="alternate" type="text/html" href="https://mail.google.com/mail?account_id=me&amp;message_id=1"/><id>tag:gmail.google.com,2004:111</id><issued>2026-10-08T10:00:00Z</issued><author><name>GitHub</name><email>notifications@github.com</email></author></entry></feed>`;
const p=MS.parseAtom(atom); console.log("atom", p.account, p.fullcount, JSON.stringify(p.entries[0]));
// gmail filters
const f=MS.exportGmailFilters(MS.merge(S,{rules:[{name:"a",when:{from:["@example.org"],subject_any:["invoice","purchase order"]},category:"Work",subcategory:"Clients"},{name:"regex",when:{subject_regex:"x"},category:"Z"}],notifications:{only_senders:["boss@example.org"]},spam:{blocked_senders:["spam.xyz"]}}),{});
console.log(f.count, f.skipped); console.log(f.xml);
process.exit(bad?1:0);
