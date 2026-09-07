/* Reachability check: every list in the edit zone should actually show up on a
   screen. For each block it picks a distinctive phrase out of the block's own
   contents, renders every page and panel, and reports any block whose phrase
   never appeared.

   This is what catches "I rewrote that block beautifully and it renders
   nowhere". Nothing is mutated and no fixture strings are hardcoded, so it
   keeps working after a customisation pass.

   Usage: node tools/reach.js "Pulse v4 Glass.dc.html"                       */
const fs = require("fs"), Module = require("module");

const FILE = process.argv[2] || "Pulse v4 Glass.dc.html";
const src = fs.readFileSync(FILE, "utf8");
const js = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*)<\/script>/)[1];

/* Blocks whose page exists but is not currently navigable. Already dead when
   this template was cut; listed so the check stays quiet about them. Delete a
   name from here if its page comes back. */
const KNOWN_UNREACHABLE = new Set([
  "REVENUE_SPLIT", "HEALTH_TILES", "HEALTH_FAILURES", "HEALTH_CALLS", "MODULE_ROWS"
]);

const BLOCKS = [
  "ORGS","TEAMS","LOCATIONS","CONTACTS","FILE_TREE","PEOPLE","INTEGRATIONS",
  "DATA_EVENTS","PEOPLE_EVENTS","AI_EVENTS","ITEMS","ANSWERS",
  "AGENT_DEFS","KPI_DEFS","ASPECT_DEFS","OPS_DEFS","WORK_TASKS","WORKFLOWS","SCHEDULES",
  "WORK_WIDGETS","ADMIN_CARDS","QUEUE_TASKS","APPROVAL_ROWS","REVENUE_SPLIT","ADMIN_URGENT",
  "AUTOMATION_ROWS","HEALTH_TILES","HEALTH_FAILURES","HEALTH_CALLS","NOTIFICATION_FEED",
  "MODULE_ROWS","HOME_SUGGESTIONS","HOME_ACTIVITY","MINI_SUGGESTIONS","VISIT_WIDGET",
  "SCHEDULE_NEXT","ROLES","ACTIVITY_KPIS","BUILDER_BLOCKS","PALETTE_RECENT",
  "CONTACT_SEARCH","EVENT_DIFF","PALETTE_FREQUENT","MINI_NOTIFICATIONS"
];

global.window = {innerWidth:1440, devicePixelRatio:2, addEventListener(){}, removeEventListener(){}};
global.document = {createElement:()=>({getContext:()=>null, style:{}}), addEventListener(){}, removeEventListener(){}};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};

let mod;
try {
  mod = new Module("dc");
  mod._compile('class DCLogic{constructor(){this.state={};}setState(u){' +
    'const n=typeof u==="function"?u(this.state):u;Object.assign(this.state,n);}};' +
    js + ";module.exports={Component," + BLOCKS.join(",") + "};", "/dc.js");
} catch (e) {
  console.error("FAIL  reach: " + e.message);
  process.exit(1);
}
const Component = mod.exports.Component;

/* A phrase worth probing with: prose rather than an id or a CSS value. */
const phrases = (v, out = []) => {
  if (typeof v === "string") {
    if (v.length > 12 && v.includes(" ") && !v.includes("var(--") &&
        !/^[a-z]+[:.]/.test(v) && !/^[MmLlHhVvCcZz][\d\s.,-]/.test(v)) out.push(v);
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v)) phrases(v[k], out);
  }
  return out;
};

const out = [];
const render = (patch) => {
  const c = new Component();
  if (c.seedActivity) { try { c.seedActivity(); } catch {} }
  Object.assign(c.state, patch);
  try { out.push(JSON.stringify(c.renderVals(), (k, v) => typeof v === "function" ? undefined : v)); }
  catch { /* a state combination that will not render is not this check's problem */ }
};

["Home","Agents","Dashboard","Work","Records","Activity","Settings",
 "Automations","System health","Installed modules"].forEach(p => render({page:p}));
["people","teams","structure","agents","wf","notif","integrations","modules","health",
 "security","audit","datamgmt","brand","appearance"].forEach(a => render({page:"Settings", adminOpen:a}));
["tasks","approvals","workflows","schedules"].forEach(w => render({page:"Work", workSection:w}));
["Awaiting you","Awaiting others","Decided"].forEach(v =>
  render({page:"Work", workSection:"approvals", workViews:{approvals:v}}));
["contacts","files","ontology"].forEach(r => render({page:"Records", recSection:r}));
["7d","30d","90d"].forEach(r => render({page:"Dashboard", range:r}));
["sales","cash","operations"].forEach(a => render({page:"Dashboard", aspect:a}));
["all","people","ai","attention"].forEach(k => render({page:"Activity", actKpi:k}));
render({page:"Home", miniOpen:true});
render({page:"Home", paletteOpen:true});
render({page:"Agents", builderGenerated:true});
render({page:"Records", newRecOpen:true});
{ const c = new Component();
  try { c.seedActivity();
    const ev = (c.feeds && c.feeds.people || [])[0];
    if (ev) render({page:"Activity", actOpen:ev.id});
  } catch {} }

const all = out.join("\n");
const missing = [], unprobed = [];
for (const name of BLOCKS) {
  if (KNOWN_UNREACHABLE.has(name)) continue;
  const block = mod.exports[name];
  if (block === undefined) { unprobed.push(name + " (not found)"); continue; }
  const probes = phrases(block);
  if (!probes.length) { unprobed.push(name + " (no prose to probe)"); continue; }
  if (!probes.some(p => all.includes(p))) missing.push(name);
}

if (unprobed.length) console.log("  --  reach — not probed: " + unprobed.join(", "));
if (missing.length) {
  console.error("FAIL  these blocks render nowhere: " + missing.join(", "));
  console.error("      Either they lost their consumer, or a page stopped rendering.");
  process.exit(1);
}
console.log("  ok  reach — every live block appears on a screen (" +
  KNOWN_UNREACHABLE.size + " known-dead skipped)");
