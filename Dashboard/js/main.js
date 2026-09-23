/* Controls, theme, command menu and start-up. Loaded last.
   Classic script (not a module) so the page still works when opened from disk. */

/* ============================================================
   FILTER CONTROLS WIRING
   ============================================================ */
function teamsMatching(q){
  q = q.trim().toLowerCase();
  if(!q) return [];
  return ALL_TEAMS.filter(t=>[t, displayName(t), shortName(t), teamMeta(t).abbr].some(s=>s.toLowerCase().includes(q)));
}

function populateControls(){
  d3.select("#seasonSelect").selectAll("option").remove();
  d3.select("#seasonSelect").append("option").attr("value","All").text("All seasons");
  ALL_SEASONS.slice().sort((a,b)=>b-a).forEach(s=>{
    d3.select("#seasonSelect").append("option").attr("value",s).text(seasonLabel(s));
  });
  d3.select("#seasonSelect").on("change", function(){ state.season = this.value; onFilterChange(); });
  d3.select("#venueSelect").on("change", function(){ state.venue = this.value; onFilterChange(); });
  d3.select("#resultSelect").on("change", function(){ state.result = this.value; onFilterChange(); });

  d3.select("#resetBtn").on("click", resetAll);

  // Tabs: click, plus Left/Right/Home/End per the WAI-ARIA tabs pattern
  const tabs = d3.selectAll(".nav-tab");
  tabs.on("click", function(){ goToView(this.dataset.view); });
  tabs.on("keydown", function(event){
    const list = tabs.nodes(), i = list.indexOf(this);
    const next = { ArrowRight: (i+1)%list.length, ArrowLeft: (i-1+list.length)%list.length, Home: 0, End: list.length-1 }[event.key];
    if(next==null) return;
    event.preventDefault();
    list[next].focus();
    goToView(list[next].dataset.view);
  });

  // Fade the edge of the tab strip that has hidden tabs behind it
  const strip = document.querySelector(".nav-tabs");
  const updateFade = ()=>{
    strip.classList.toggle("fade-left", strip.scrollLeft > 4);
    strip.classList.toggle("fade-right", strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4);
  };
  strip.addEventListener("scroll", updateFade, { passive:true });
  window.addEventListener("resize", debounce(updateFade, 100));
  updateFade();

  // Team search: combobox with keyboard navigation
  const input = d3.select("#searchInput");
  const suggestBox = d3.select("#searchSuggest");
  let active = -1, matches = [];
  const close = ()=>{ suggestBox.classed("hidden",true).html(""); input.attr("aria-expanded","false").attr("aria-activedescendant",null); active=-1; };
  const choose = t=>{ state.team = t; onFilterChange(); input.property("value",""); close(); };
  const highlight = i=>{
    active = i;
    suggestBox.selectAll(".search-suggest-item").attr("aria-selected",(d,j)=>j===i);
    input.attr("aria-activedescendant", i>=0 ? `suggest-${i}` : null);
  };
  input.on("input", function(){
    matches = teamsMatching(this.value).slice(0,8);
    if(!this.value.trim()){ close(); return; }
    suggestBox.html("").classed("hidden", false);
    input.attr("aria-expanded","true");
    if(!matches.length){
      suggestBox.append("li").attr("class","search-suggest-item").attr("aria-disabled","true").style("cursor","default").text("No matching club");
      return;
    }
    matches.forEach((t,i)=>{
      const item = suggestBox.append("li").datum(t).attr("class","search-suggest-item").attr("role","option").attr("id",`suggest-${i}`)
        .on("mousedown", event=>event.preventDefault())
        .on("click", ()=>choose(t));
      item.html(teamBadgeSVG(t,20));
      item.append("span").text(displayName(t));
    });
    highlight(0);
  });
  input.on("keydown", function(event){
    if(event.key==="ArrowDown" && matches.length){ event.preventDefault(); highlight((active+1)%matches.length); }
    else if(event.key==="ArrowUp" && matches.length){ event.preventDefault(); highlight((active-1+matches.length)%matches.length); }
    else if(event.key==="Enter" && active>=0 && matches[active]){ event.preventDefault(); choose(matches[active]); }
    else if(event.key==="Escape"){ close(); }
  });
  input.on("blur", ()=>setTimeout(close, 120));
}

/* ============================================================
   THEME: Light (default), Dark, or Auto (follows the computer's setting).
   The choice is remembered per browser. A tiny script in <head> applies it
   before first paint so the page never flashes the wrong theme.
   ============================================================ */
const THEMES = ["light","dark","system"];
const THEME_LABEL = { light:"Light", dark:"Dark", system:"Auto" };
const THEME_ICON = {
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
};
const THEME_KEY = "pl-dashboard-theme";
let theme = "light";
function readStoredTheme(){ try{ const t = localStorage.getItem(THEME_KEY); return THEMES.includes(t) ? t : "light"; }catch(e){ return "light"; } }
function setTheme(t, rerender){
  theme = t;
  if(t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  try{ localStorage.setItem(THEME_KEY, t); }catch(e){ /* storage unavailable, so the theme lasts for this visit only */ }
  const next = THEMES[(THEMES.indexOf(t)+1) % THEMES.length];
  d3.select("#themeIcon").html(THEME_ICON[t]);
  d3.select("#themeLabel").text(THEME_LABEL[t]);
  d3.select("#themeBtn").attr("aria-label", `${THEME_LABEL[t]} theme. Switch to ${THEME_LABEL[next].toLowerCase()} theme`)
    .attr("title", `Switch to ${THEME_LABEL[next].toLowerCase()} theme`);
  if(rerender) renderCurrentView();   // canvas and team-ink colours are resolved at draw time
}
function initTheme(){
  setTheme(readStoredTheme(), false);
  d3.select("#themeBtn").on("click", ()=>setTheme(THEMES[(THEMES.indexOf(theme)+1) % THEMES.length], true));
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", ()=>{ if(theme === "system") renderCurrentView(); });
}

/* ============================================================
   COMMAND MENU — Ctrl/⌘+K or "/" (Linear / Raycast pattern)
   Clubs, views, seasons, filters and actions in one fuzzy list.
   ============================================================ */
const ICON = {
  view: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  filter: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>',
  action: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};
function commandItems(){
  const items = [];
  const viewNames = { overview:"Executive Overview", explore:"Exploratory Analysis", detail:"Detailed Investigation", story:"Story & Insights" };
  VIEWS.forEach(v=>items.push({ group:"Views", label:viewNames[v], icon:ICON.view, hint: state.view===v ? "Current" : "", run:()=>goToView(v) }));
  ALL_TEAMS.forEach(t=>items.push({ group:"Clubs", label:displayName(t), keys:[t, shortName(t), teamMeta(t).abbr].join(" "),
    icon: teamBadgeSVG(t,20), hint: state.team===t ? "Selected" : "Open", run:()=>drillToTeam(t) }));
  const filter = (label, apply, active)=>items.push({ group:"Filters", label, icon:ICON.filter, hint: active ? "Active" : "", run:()=>{ apply(); onFilterChange(); } });
  filter("All seasons", ()=>state.season="All", state.season==="All");
  ALL_SEASONS.slice().reverse().forEach(s=>filter(`Season ${seasonLabel(s)}`, ()=>state.season=String(s), state.season===String(s)));
  filter("Home matches only", ()=>state.venue="Home", state.venue==="Home");
  filter("Away matches only", ()=>state.venue="Away", state.venue==="Away");
  filter("All venues", ()=>state.venue="All", state.venue==="All");
  ["W","D","L"].forEach(r=>filter(`${resultName(r)}s only`, ()=>state.result=r, state.result===r));
  filter("All results", ()=>state.result="All", state.result==="All");
  items.push({ group:"Actions", label:"Reset all filters", icon:ICON.action, run:resetAll });
  THEMES.forEach(t=>items.push({ group:"Actions", label:`Use ${THEME_LABEL[t].toLowerCase()} theme`, keys:"dark light mode appearance", icon:ICON.action,
    hint: theme===t ? "Current" : "", run:()=>setTheme(t, true) }));
  return items;
}
/** 0 = no match; higher is better. Prefix > word start > substring > in-order letters. */
function commandScore(item, q){
  if(!q) return 1;
  const label = item.label.toLowerCase(), hay = (item.label + " " + (item.keys||"")).toLowerCase();
  if(label.startsWith(q)) return 4;
  if(hay.split(/[\s&/-]+/).some(w=>w.startsWith(q))) return 3;
  if(hay.includes(q)) return 2;
  let i = 0; for(const ch of hay){ if(ch === q[i]) i++; if(i === q.length) return 1; }
  return 0;
}
function initCommandMenu(){
  const root = d3.select("#cmdk"), input = d3.select("#cmdkInput"), list = d3.select("#cmdkList");
  let items = [], shown = [], active = 0, returnFocus = null;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  d3.select("#cmdkKbd").text(isMac ? "⌘K" : "Ctrl K");

  const render = ()=>{
    const q = input.property("value").trim().toLowerCase();
    shown = items.map(it=>({ it, s: commandScore(it, q) })).filter(r=>r.s>0);
    // Loose in-order-letter matches only as a fallback (typos), never mixed in with real matches
    if(shown.some(r=>r.s>=2)) shown = shown.filter(r=>r.s>=2);
    if(q) shown.sort((a,b)=>b.s-a.s);
    // keep groups together, in order of their best match
    const order = [...new Set(shown.map(r=>r.it.group))];
    shown = order.flatMap(g=>shown.filter(r=>r.it.group===g)).map(r=>r.it);
    active = Math.min(active, Math.max(0, shown.length-1));
    list.html("");
    if(!shown.length){ list.append("li").attr("class","cmdk-empty").attr("role","presentation").text("No results"); input.attr("aria-activedescendant", null); return; }
    let group = null;
    shown.forEach((it,i)=>{
      if(it.group !== group){ group = it.group; list.append("li").attr("class","cmdk-group").attr("role","presentation").text(group); }
      const li = list.append("li").attr("class","cmdk-item").attr("role","option").attr("id",`cmdk-${i}`)
        .attr("aria-selected", i===active)
        .on("mousemove", ()=>{ if(active!==i){ active = i; highlight(); } })
        .on("mousedown", e=>e.preventDefault())
        .on("click", ()=>run(i));
      li.append("span").attr("class","cmdk-icon").html(it.icon);
      li.append("span").text(it.label);
      if(it.hint) li.append("span").attr("class","hint").text(it.hint);
    });
    highlight();
  };
  const highlight = ()=>{
    list.selectAll(".cmdk-item").attr("aria-selected", function(){ return this.id === `cmdk-${active}`; });
    input.attr("aria-activedescendant", shown.length ? `cmdk-${active}` : null);
    document.getElementById(`cmdk-${active}`)?.scrollIntoView({ block:"nearest" });
  };
  const open = ()=>{
    if(!root.classed("hidden")) return;
    returnFocus = document.activeElement;
    items = commandItems(); active = 0;
    input.property("value","");
    root.classed("hidden", false);
    render();
    input.node().focus();
  };
  const close = ()=>{
    root.classed("hidden", true);
    if(returnFocus && document.contains(returnFocus)) returnFocus.focus();
  };
  const run = i=>{ const it = shown[i]; if(!it) return; close(); it.run(); };

  input.on("input", ()=>{ active = 0; render(); });
  input.on("keydown", event=>{
    if(event.key==="ArrowDown"){ event.preventDefault(); active = (active+1) % shown.length; highlight(); }
    else if(event.key==="ArrowUp"){ event.preventDefault(); active = (active-1+shown.length) % shown.length; highlight(); }
    else if(event.key==="Enter"){ event.preventDefault(); run(active); }
    else if(event.key==="Escape"){ event.preventDefault(); close(); }
    else if(event.key==="Tab"){ event.preventDefault(); }   // focus stays in the dialog
  });
  root.on("mousedown", event=>{ if(event.target === root.node()) close(); });
  d3.select("#cmdkBtn").on("click", open);
  document.addEventListener("keydown", event=>{
    const typing = event.target.closest && event.target.closest("input, select, textarea, [contenteditable]");
    if((event.key==="k" || event.key==="K") && (event.metaKey || event.ctrlKey)){ event.preventDefault(); root.classed("hidden") ? open() : close(); }
    else if(event.key==="/" && !typing && root.classed("hidden")){ event.preventDefault(); open(); }
  });
}

/* ============================================================
   INIT
   ============================================================ */
function init(){
  d3.select("#lastUpdated").text(fmtDateShort(parseDate(DATA_MAX_DATE)));
  // Each fixture appears twice in the data (once per club), so count distinct fixtures for "matches"
  const fixtures = new Set(RAW_DATA.map(d=>d.date + "|" + [d.team, d.opponent].sort().join("|"))).size;
  const clubs = new Set(RAW_DATA.map(d=>d.team)).size;
  d3.select("#headerCounts").text(`${fmtInt(fixtures)} matches, ${clubs} clubs, ${ALL_SEASONS.length} seasons`);
  initTheme();
  populateControls();
  initCommandMenu();
  readHash();
  syncControls();
  renderChips();
  goToView(state.view, { history:false });
}
init();
