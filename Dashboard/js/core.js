/* Shared foundation: team metadata, colour helpers, data decoding, state, filters,
   tooltip, formatting, URL state and chart utilities. Loaded first.
   Classic script (not a module) so the page still works when opened from disk. */

/* ============================================================
   TEAM METADATA
   Real club shirt colours are public facts, not trademarked
   artwork — used here as fills for generated monogram badges,
   not as reproductions of any club crest or the PL logo.
   `name` overrides the data's spelling for display; `short` is
   used where horizontal space is tight.
   ============================================================ */
const TEAM_META = {
  "Arsenal":                   { abbr:"ARS", color:"#EF0107" },
  "Aston Villa":               { abbr:"AVL", color:"#670E36" },
  "Bournemouth":               { abbr:"BOU", color:"#DA291C" },
  "Brentford":                 { abbr:"BRE", color:"#E30613" },
  "Brighton And Hove Albion":  { abbr:"BHA", color:"#0057B8", name:"Brighton & Hove Albion", short:"Brighton" },
  "Burnley":                   { abbr:"BUR", color:"#6C1D45" },
  "Chelsea":                   { abbr:"CHE", color:"#034694" },
  "Crystal Palace":            { abbr:"CRY", color:"#1B458F" },
  "Everton":                   { abbr:"EVE", color:"#003399" },
  "Fulham":                    { abbr:"FUL", color:"#000000" },
  "Ipswich Town":              { abbr:"IPS", color:"#0044A9", short:"Ipswich" },
  "Leeds United":              { abbr:"LEE", color:"#0D3F76", short:"Leeds" },
  "Leicester City":            { abbr:"LEI", color:"#003090", short:"Leicester" },
  "Liverpool":                 { abbr:"LIV", color:"#C8102E" },
  "Luton Town":                { abbr:"LUT", color:"#002D62", short:"Luton" },
  "Manchester City":           { abbr:"MCI", color:"#6CABDD", short:"Man City" },
  "Manchester United":         { abbr:"MUN", color:"#DA291C", short:"Man Utd" },
  "Newcastle United":          { abbr:"NEW", color:"#241F20", short:"Newcastle" },
  "Norwich City":              { abbr:"NOR", color:"#00A650", short:"Norwich" },
  "Nottingham Forest":         { abbr:"NFO", color:"#DD0000", short:"Nott'm Forest" },
  "Sheffield United":          { abbr:"SHU", color:"#EE2737", short:"Sheffield Utd" },
  "Southampton":               { abbr:"SOU", color:"#D71920" },
  "Tottenham Hotspur":         { abbr:"TOT", color:"#132257", short:"Tottenham" },
  "Watford":                   { abbr:"WAT", color:"#FBEE23" },
  "West Bromwich Albion":      { abbr:"WBA", color:"#122F67", short:"West Brom" },
  "West Ham United":           { abbr:"WHU", color:"#7A263A", short:"West Ham" },
  "Wolverhampton Wanderers":   { abbr:"WOL", color:"#FDB913", short:"Wolves" },
};
const FALLBACK_TEAM = { abbr:"?", color:"#8A8194" };

function teamMeta(team){ return TEAM_META[team] || { ...FALLBACK_TEAM, abbr:(team||"?").slice(0,3).toUpperCase() }; }
function displayName(team){ return teamMeta(team).name || team; }
function shortName(team){ return teamMeta(team).short || displayName(team); }
/** Club colour as a fill (badges, treemap tiles). */
function teamColor(team){ return teamMeta(team).color; }

/* ============================================================
   COLOUR HELPERS — all chart colours come from CSS tokens
   ============================================================ */
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function relLuminance(r,g,b){
  const lin = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
}
function luminanceOf(color){ const c = d3.rgb(color); return relLuminance(c.r, c.g, c.b); }
function contrastRatio(a, b){
  const la = luminanceOf(a), lb = luminanceOf(b);
  return (Math.max(la,lb)+0.05) / (Math.min(la,lb)+0.05);
}
/** Dark or light text, whichever reads better on `hex`. */
function contrastText(hex){
  const dark = cssVar("--text-1") || "#1C0E22";
  return contrastRatio(hex, dark) >= contrastRatio(hex, "#FFFFFF") ? dark : "#FFFFFF";
}
/** Club colour adjusted to stay visible as a line/mark on the current surface (≥ 2:1). */
const inkCache = new Map();
function teamInk(team){
  const surface = cssVar("--surface") || "#FFFFFF";
  const key = team + "|" + surface;
  if(inkCache.has(key)) return inkCache.get(key);
  let c = d3.hsl(teamColor(team));
  const lighten = luminanceOf(surface) < 0.2;
  for(let i=0; i<12 && contrastRatio(c.formatHex(), surface) < 2; i++){
    c.l = lighten ? Math.min(0.92, c.l + 0.07) : Math.max(0.08, c.l - 0.07);
  }
  const out = c.formatHex();
  inkCache.set(key, out);
  return out;
}
const RESULT_TOKEN = { W:"--win", D:"--draw", L:"--loss" };
function resultFill(r){ return cssVar(RESULT_TOKEN[r]); }
function resultName(r){ return r==="W" ? "Win" : r==="D" ? "Draw" : "Loss"; }

function teamBadgeSVG(team, size){
  size = size || 34;
  const meta = teamMeta(team);
  const fs = Math.round(size*0.36);
  return `<svg class="team-badge" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="background:${meta.color}" aria-hidden="true">
    <text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle"
      fill="${contrastText(meta.color)}" font-size="${fs}" font-weight="800" style="font-family:var(--font-ui)">${meta.abbr}</text>
  </svg>`;
}

function seasonLabel(s){
  if(s == null || s === "All") return "All seasons";
  const y = +s;
  return `${y-1}/${String(y).slice(2)}`;
}

/* ============================================================
   DATA — decode the columnar file into one object per team-match
   ============================================================ */
const RAW_DATA = (()=>{
  const { count, dicts, cols } = window.PL_MATCHES;
  const keys = Object.keys(cols);
  const rows = new Array(count);
  for(let i=0; i<count; i++){
    const o = {};
    for(const k of keys){ const v = cols[k][i]; o[k] = dicts[k] ? dicts[k][v] : v; }
    rows[i] = o;
  }
  return rows;
})();

/** Deterministic 0–1 value per match, so jitter and sampling don't reshuffle on every redraw. */
function hash01(str){
  let h = 2166136261;
  for(let i=0; i<str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
const JITTER = new Map(RAW_DATA.map(d=>[d, [hash01(d.date+d.team+"x"), hash01(d.date+d.team+"y")]]));
function jitterOf(d, axis, spread){ return (JITTER.get(d)[axis] - 0.5) * spread; }

const ALL_TEAMS = Object.keys(TEAM_META).sort((a,b)=>d3.ascending(displayName(a), displayName(b)));
const ALL_SEASONS = Array.from(new Set(RAW_DATA.map(d=>d.season))).sort((a,b)=>a-b);
const DATA_MAX_DATE = d3.max(RAW_DATA, d=>d.date);
const OVERALL = {
  avgPoints: d3.mean(RAW_DATA, d=>d.points),
  avgXgDiff: d3.mean(RAW_DATA, d=>d.xg_diff),
};

const state = {
  view: "overview",
  team: null,
  season: "All",
  venue: "All",
  result: "All",
  selectedMatch: null,
  sortCol: "date",
  sortDir: "desc",
};

/* ---- filtering helpers ---- */
function matchesSeason(d){ return state.season==="All" || d.season === +state.season; }
function matchesVenue(d){ return state.venue==="All" || d.venue === state.venue; }
function matchesResult(d){ return state.result==="All" || d.result === state.result; }
function matchesTeam(d){ return !state.team || d.team === state.team; }

/** Full active filter (season+venue+result+team) — used for team-specific views */
function fullFiltered(){
  return RAW_DATA.filter(d=> matchesSeason(d) && matchesVenue(d) && matchesResult(d) && matchesTeam(d));
}
/** League-wide filter (season+venue+result) ignoring team — used for cross-team comparisons */
function leagueFiltered(){
  return RAW_DATA.filter(d=> matchesSeason(d) && matchesVenue(d) && matchesResult(d));
}
/** Season+team only (ignores venue/result) — used where the chart itself encodes venue or result */
function seasonTeamFiltered(){
  return RAW_DATA.filter(d=> matchesSeason(d) && matchesTeam(d));
}
/** Season only (ignores venue/result/team) */
function seasonFiltered(){
  return RAW_DATA.filter(d=> matchesSeason(d));
}
/** Plain-English summary of the season, venue and result filters, e.g. "2023/24, away matches, wins only". */
function scopeDescription(){
  const parts = [seasonLabel(state.season)];
  if(state.venue !== "All") parts.push(`${state.venue.toLowerCase()} matches`);
  if(state.result !== "All") parts.push(`${resultName(state.result).toLowerCase()}s only`);
  return parts.join(", ");
}
function ordinal(n){
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}
function isUnfiltered(){
  return !state.team && state.season==="All" && state.venue==="All" && state.result==="All";
}

function effectiveSeasonForTrend(){
  if(state.season !== "All") return +state.season;
  return d3.max(ALL_SEASONS);
}

function recordCount(){ return fullFiltered().length; }

/* ============================================================
   TOOLTIP — follows the pointer, or anchors to a focused element;
   always kept inside the viewport.
   ============================================================ */
const tooltip = d3.select("body").append("div").attr("class","viz-tooltip").attr("role","tooltip");
function placeTooltip(x, y){
  const node = tooltip.node();
  const w = node.offsetWidth, h = node.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = x + 14, top = y + 12;
  if(left + w > vw - 8) left = Math.max(8, x - w - 14);
  if(top + h > vh - 8) top = Math.max(8, y - h - 12);
  tooltip.style("left", left+"px").style("top", top+"px");
}
function showTooltip(html, event){
  tooltip.html(html).style("opacity",1);
  placeTooltip(event.clientX, event.clientY);
}
function moveTooltip(event){ placeTooltip(event.clientX, event.clientY); }
function showTooltipAt(html, el){
  const r = el.getBoundingClientRect();
  tooltip.html(html).style("opacity",1);
  placeTooltip(r.left + r.width/2, r.top + r.height/2);
}
/** Tooltip body as label/value rows (no "Label: value" strings). rows = [[label, value], ...] */
function ttRows(rows){ return rows.map(([l,v])=>`<div class="tt-row"><span>${l}</span><b>${v}</b></div>`).join(""); }
function hideTooltip(){ tooltip.style("opacity",0); }
/** Speak a short status to screen readers (for keyboard-driven chart exploration). */
function announce(text){ d3.select("#srLive").text(text); }

/**
 * Hover + keyboard behaviour for a chart mark selection.
 * opts.html(d) → tooltip HTML; opts.label(d) → accessible name (makes the mark focusable);
 * opts.onActivate(event,d) → click / Enter / Space.
 */
function bindMark(sel, opts){
  sel.on("mouseenter.tip", function(event,d){ showTooltip(opts.html(d), event); })
    .on("mousemove.tip", moveTooltip)
    .on("mouseleave.tip", hideTooltip);
  if(opts.label){
    sel.attr("tabindex",0).attr("role", opts.onActivate ? "button" : "img")
      .attr("aria-label", d=>opts.label(d))
      .on("focus.tip", function(event,d){ showTooltipAt(opts.html(d), this); })
      .on("blur.tip", hideTooltip);
  }
  if(opts.onActivate){
    sel.style("cursor","pointer")
      .on("click.act", (event,d)=>{ hideTooltip(); opts.onActivate(event,d); })
      .on("keydown.act", (event,d)=>{
        if(event.key==="Enter" || event.key===" "){ event.preventDefault(); hideTooltip(); opts.onActivate(event,d); }
      });
  }
  return sel;
}

/* ============================================================
   SMALL FORMAT HELPERS
   ============================================================ */
const fmt1 = d3.format(".1f");
const fmt2 = d3.format(".2f");
const fmtInt = d3.format(",");
const parseDate = d3.timeParse("%Y-%m-%d");
const fmtDateShort = d3.timeFormat("%d %b %Y");
const fmtDateCompact = d3.timeFormat("%-d %b ’%y");

function signed(n, digits){
  const v = n.toFixed(digits==null?2:digits);
  return (n>0? "+":"") + v;
}
function signClass(n){ return Math.abs(n) < 0.005 ? "zero" : n>0 ? "pos" : "neg"; }

/* ============================================================
   ACTIVE FILTER CHIPS + RECORD COUNT
   ============================================================ */
function renderChips(){
  const wrap = d3.select("#chipRow");
  const chips = [];
  if(state.team) chips.push({k:"team", label:displayName(state.team)});
  if(state.season!=="All") chips.push({k:"season", label:`${seasonLabel(state.season)} season`});
  if(state.venue!=="All") chips.push({k:"venue", label:`${state.venue} matches`});
  if(state.result!=="All") chips.push({k:"result", label:`${resultName(state.result)}s only`});

  const sel = wrap.selectAll(".chip").data(chips, d=>d.k);
  sel.exit().remove();
  const enter = sel.enter().append("div").attr("class","chip");
  enter.append("span").attr("class","chip-label");
  enter.append("button").attr("type","button").text("✕").on("click", (event,d)=>{
    if(d.k==="team") setTeam(null);
    else { state[d.k] = "All"; onFilterChange(); }
  });
  const all = wrap.selectAll(".chip");
  all.select(".chip-label").text(d=>d.label);
  all.select("button").attr("aria-label", d=>`Remove filter ${d.label}`);

  d3.select("#recordCount").html(`Showing <b>${fmtInt(recordCount())}</b> of <b>${fmtInt(RAW_DATA.length)}</b> team results`);
}

/* ============================================================
   STATE MUTATORS
   ============================================================ */
function setTeam(team){
  state.team = (state.team === team) ? null : team;
  onFilterChange();
}
function resetAll(){
  state.team = null; state.season="All"; state.venue="All"; state.result="All"; state.selectedMatch=null;
  d3.select("#searchInput").property("value","");
  onFilterChange();
}
/* ============================================================
   URL STATE — view + filters live in the hash, e.g.
   #view=explore&season=2024&venue=Home&team=Arsenal
   Changing view adds a history entry (Back works); filter changes replace it.
   ============================================================ */
const VIEWS = ["overview","explore","detail","story"];
let lastWrittenHash = null;
function stateHash(){
  const p = new URLSearchParams();
  if(state.view !== "overview") p.set("view", state.view);
  if(state.season !== "All") p.set("season", state.season);
  if(state.venue !== "All") p.set("venue", state.venue);
  if(state.result !== "All") p.set("result", state.result);
  if(state.team) p.set("team", state.team);
  const s = p.toString();
  return s ? "#" + s : "";
}
function writeHash(push){
  const h = stateHash();
  if(h === location.hash) return;
  lastWrittenHash = h;
  const url = location.pathname + location.search + h;
  try{ push ? history.pushState(null, "", url || "#") : history.replaceState(null, "", url || "#"); }
  catch(e){ push ? (location.hash = h) : location.replace(h || "#"); }
}
/** Read the hash into state, ignoring anything that isn't a known value. */
function readHash(){
  const p = new URLSearchParams(location.hash.slice(1));
  const pick = (key, allowed, fallback) => allowed.includes(p.get(key)) ? p.get(key) : fallback;
  state.view = pick("view", VIEWS, "overview");
  state.season = pick("season", ALL_SEASONS.map(String), "All");
  state.venue = pick("venue", ["Home","Away"], "All");
  state.result = pick("result", ["W","D","L"], "All");
  state.team = pick("team", Object.keys(TEAM_META), null);
}
function applyHashState(){
  readHash();
  state.selectedMatch = null;
  syncControls();
  renderChips();
  goToView(state.view, { history:false });
}
window.addEventListener("popstate", applyHashState);
window.addEventListener("hashchange", ()=>{ if(location.hash !== lastWrittenHash) applyHashState(); });

function goToView(view, opts){
  const changed = state.view !== view;
  state.view = view;
  if(!opts || opts.history !== false) writeHash(changed);
  scrollActiveTabIntoView(view);
  d3.selectAll(".nav-tab").each(function(){
    const on = this.dataset.view===view;
    d3.select(this).attr("aria-selected", on).attr("tabindex", on ? 0 : -1);
  });
  d3.selectAll(".view").classed("hidden", function(){ return this.dataset.view!==view; });
  renderCurrentView();
}
function drillToTeam(team){
  state.team = team;
  renderChips();
  goToView("detail");
}

function syncControls(){
  d3.select("#seasonSelect").property("value", state.season);
  d3.select("#venueSelect").property("value", state.venue);
  d3.select("#resultSelect").property("value", state.result);
}

function onFilterChange(){
  syncControls();
  renderChips();
  writeHash(false);
  renderCurrentView();
}
/** On narrow screens the tab strip scrolls: keep the active tab visible. */
function scrollActiveTabIntoView(view){
  const tab = document.getElementById("tab-"+view), strip = tab && tab.parentElement;
  if(!strip || strip.scrollWidth <= strip.clientWidth) return;
  strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth)/2, behavior: "smooth" });
}

function renderCurrentView(){
  hideTooltip();
  if(state.view==="overview") renderOverview();
  else if(state.view==="explore") renderExplore();
  else if(state.view==="detail") renderDetail();
  else if(state.view==="story") renderStory();
}

/* ============================================================
   CHART UTILITIES
   ============================================================ */
function chartWidth(sel){
  const w = sel.node().getBoundingClientRect().width;
  return Math.max(240, w);
}
function freshSvg(container, height, label){
  const el = d3.select(container);
  el.selectAll("*").remove();
  const width = chartWidth(el);
  const svg = el.append("svg").attr("width", width).attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`);
  describeSvg(svg, label);
  return { svg, width, height };
}
/** Accessible name for a chart: role=img + aria-label (charts with focusable marks use role=group). */
function describeSvg(svg, label, hasInteractiveMarks){
  if(!label) return svg;
  return svg.attr("role", hasInteractiveMarks ? "group" : "img").attr("aria-label", label);
}
function emptyState(container, title, sub){
  d3.select(container).html(
    `<div class="chart-empty" role="status"><div>${title}</div>${sub?`<div class="sub">${sub}</div>`:""}</div>`
  );
}
/** Truncate SVG <text> to maxWidth with an ellipsis; full text stays available as a <title>. */
function fitText(sel, maxWidth){
  sel.each(function(){
    const t = d3.select(this);
    const full = t.text();
    if(this.getComputedTextLength() <= maxWidth) return;
    let s = full;
    while(s.length > 1 && this.getComputedTextLength() > maxWidth){
      s = s.slice(0,-1);
      t.text(s.trimEnd() + "…");
    }
    t.append("title").text(full);
  });
}
function axisTitle(g, text, x, y, rotate){
  const t = g.append("text").attr("class","chart-axis-title").attr("text-anchor","middle").text(text);
  if(rotate) t.attr("transform","rotate(-90)").attr("x",-y).attr("y",x);
  else t.attr("x",x).attr("y",y);
  return t;
}

/** Canvas layer under a chart's SVG, for marks too numerous for the DOM. Returns a DPR-scaled 2D context. */
function canvasLayer(container, width, height){
  const canvas = d3.select(container).insert("canvas", ":first-child")
    .attr("class","chart-canvas").attr("aria-hidden","true")
    .style("width", width+"px").style("height", height+"px").node();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return ctx;
}
/**
 * Hover/tap tooltips for canvas-drawn points: `pts` are {x, y, d} in SVG coordinates.
 * A single overlay <rect> finds the nearest point with a Delaunay search and draws a highlight ring.
 */
function canvasPointHover(g, pts, w, h, html, onActivate){
  const delaunay = d3.Delaunay.from(pts, p=>p.x, p=>p.y);
  const ring = g.append("circle").attr("r",6).attr("fill","none").style("stroke","var(--text-1)").attr("stroke-width",1.5)
    .attr("pointer-events","none").attr("opacity",0);
  let current = null;
  g.append("rect").attr("width",w).attr("height",h).attr("fill","transparent")
    .style("cursor", onActivate ? "pointer" : "crosshair")
    .on("mousemove", function(event){
      const [mx,my] = d3.pointer(event, this);
      const i = delaunay.find(mx,my);
      const p = pts[i];
      if(!p || Math.hypot(p.x-mx, p.y-my) > 14){ current = null; ring.attr("opacity",0); hideTooltip(); return; }
      current = p;
      ring.attr("cx",p.x).attr("cy",p.y).attr("opacity",1);
      showTooltip(html(p.d), event);
    })
    .on("mouseleave", ()=>{ current = null; ring.attr("opacity",0); hideTooltip(); })
    .on("click", ()=>{ if(current && onActivate){ hideTooltip(); onActivate(current.d); } });
}

// Re-render on width changes only: mobile browsers fire `resize` when the URL bar shows/hides while scrolling.
let lastLayoutWidth = document.documentElement.clientWidth;
window.addEventListener("resize", debounce(()=>{
  const w = document.documentElement.clientWidth;
  if(w === lastLayoutWidth) return;
  lastLayoutWidth = w;
  renderCurrentView();
}, 180));
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
