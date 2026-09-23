/* Detailed Investigation view: team summary, comparison with the league, match table.
   Classic script (not a module) so the page still works when opened from disk. */

/* ============================================================
   VIEW 3 — DETAILED INVESTIGATION
   ============================================================ */
function renderDetail(){
  const bc = d3.select("#detailBreadcrumb");
  bc.html("");
  if(state.team){
    bc.append("button").attr("type","button").attr("class","crumb").text("League").on("click",()=>{ setTeam(null); });
    bc.append("span").attr("class","sep").attr("aria-hidden","true").text("›");
    bc.append("span").attr("class","current").attr("aria-current","page").text(displayName(state.team));
  } else {
    bc.append("span").attr("class","current").attr("aria-current","page").text("League");
  }

  if(!state.team){
    d3.select("#detailPrompt").classed("hidden",false);
    d3.select("#detailContent").classed("hidden",true);
    const grid = d3.select("#teamQuickGrid");
    grid.html("");
    ALL_TEAMS.forEach(t=>{
      const chip = grid.append("button").attr("type","button").attr("class","team-chip").on("click",()=>drillToTeam(t));
      chip.html(teamBadgeSVG(t,26));
      chip.append("span").text(displayName(t));
    });
    return;
  }
  d3.select("#detailPrompt").classed("hidden",true);
  d3.select("#detailContent").classed("hidden",false);

  // Every filter applies here: season, venue, result and team
  const rows = fullFiltered().sort((a,b)=> state.sortDir==="desc" ? d3.descending(a[state.sortCol],b[state.sortCol]) : d3.ascending(a[state.sortCol],b[state.sortCol]));
  const W = rows.filter(d=>d.result==="W").length, D = rows.filter(d=>d.result==="D").length, L = rows.filter(d=>d.result==="L").length;
  const pts = d3.sum(rows,d=>d.points);
  const avgXgDiff = d3.mean(rows,d=>d.xg_diff) || 0;
  const avgPoss = d3.mean(rows,d=>d.poss) || 0;
  const avgSot = d3.mean(rows,d=>d.sot) || 0;

  // Rank and league averages use the same season, venue and result filters, across all teams
  const leagueScope = leagueFiltered();
  const ranking = d3.rollups(leagueScope, v=>d3.sum(v,d=>d.points), d=>d.team).sort((a,b)=>d3.descending(a[1],b[1]));
  const rank = ranking.findIndex(r=>r[0]===state.team)+1;
  const scope = scopeDescription();

  const panel = d3.select("#summaryPanel");
  panel.html("");
  panel.append("div").html(teamBadgeSVG(state.team,64)).select("svg").attr("class","team-badge summary-badge");
  const info = panel.append("div").attr("class","summary-info");
  info.append("h2").text(displayName(state.team));
  info.append("p").text(rows.length
    ? `${scope}, ranked ${rank ? ordinal(rank) : "unranked"} of ${ranking.length} with ${W} wins, ${D} draws and ${L} losses`
    : `${scope}, no matches for this club`);
  // Form guide: last five results in scope, oldest on the left and newest on the right (FotMob convention)
  const lastFive = rows.slice().sort((a,b)=>d3.ascending(a.date,b.date)).slice(-5);
  if(lastFive.length){
    const form = info.append("div").attr("class","form-guide")
      .attr("role","img").attr("aria-label", `Last ${lastFive.length} results, most recent last, ` + lastFive.map(d=>resultName(d.result)).join(", "));
    form.append("span").attr("class","l").attr("aria-hidden","true").text("Form");
    lastFive.forEach(d=>form.append("span").attr("class",`result-pill result-${d.result}`).attr("aria-hidden","true")
      .attr("title", `${fmtDateShort(parseDate(d.date))} against ${displayName(d.opponent)}, ${d.venue.toLowerCase()}, ${d.gf} to ${d.ga}`).text(d.result));
  }
  const stats = panel.append("div").attr("class","summary-stats");
  [["Points",fmtInt(pts)],["xG Diff",signed(avgXgDiff,2)],["Avg Poss.",fmt1(avgPoss)+"%"],["Matches",rows.length]].forEach(([l,v])=>{
    const s = stats.append("div").attr("class","summary-stat");
    s.append("div").attr("class","v").text(v);
    s.append("div").attr("class","l").text(l);
  });

  // Contextual comparison with the league average in the same scope
  const leagueAvg = key => d3.mean(leagueScope, d=>d[key]) || 0;
  const teamColorInk = teamInk(state.team);
  const metrics = [
    { label:"Points per match", val: d3.mean(rows,d=>d.points)||0, avg: leagueAvg("points"),  min:0,  max:3,   fmt:fmt2 },
    { label:"xG differential",  val: avgXgDiff,                    avg: leagueAvg("xg_diff"), min:-1, max:1,   fmt:v=>signed(v,2) },
    { label:"Possession",       val: avgPoss,                      avg: leagueAvg("poss"),    min:0,  max:100, fmt:v=>fmt1(v)+"%" },
    { label:"Shots on target",  val: avgSot,                       avg: leagueAvg("sot"),     min:0,  max:Math.max(8, avgSot), fmt:fmt2 },
  ];
  const cmp = d3.select("#contextCompare"); cmp.html("");
  metrics.forEach(m=>{
    const pct = v => ((Math.max(m.min, Math.min(m.max, v)) - m.min) / (m.max - m.min)) * 100;
    const zero = pct(0);
    const row = cmp.append("div").attr("class","compare-bar-row")
      .attr("aria-label", `${m.label} ${m.fmt(m.val)}, league average ${m.fmt(m.avg)}`).attr("role","img");
    row.append("div").attr("class","compare-bar-label").text(m.label);
    const track = row.append("div").attr("class","compare-bar-track");
    if(m.min < 0) track.append("div").attr("class","compare-bar-zero").style("left", zero+"%");
    const a = Math.min(zero, pct(m.val)), b = Math.max(zero, pct(m.val));
    track.append("div").attr("class","compare-bar-fill")
      .style("left", a+"%").style("width", Math.max(1, b-a)+"%").style("background", teamColorInk);
    track.append("div").attr("class","compare-bar-marker").style("left", `calc(${pct(m.avg)}% - 1px)`)
      .attr("title", `League average ${m.fmt(m.avg)}`);
    row.append("div").attr("class","compare-bar-value").text(m.fmt(m.val));
  });
  d3.select("#contextCompareNote").text(`The bar is the club and the thin upright line is the league average, for ${scope.toLowerCase()}`);

  renderMatchTable(rows);
}

const TABLE_COLS = [
  {k:"date", label:"Date"}, {k:"opponent", label:"Opponent"}, {k:"venue", label:"Venue", hideSm:true},
  {k:"result", label:"Res"}, {k:"gf", label:"GF", num:true, title:"Goals for"}, {k:"ga", label:"GA", num:true, title:"Goals against"},
  {k:"xg", label:"xG", num:true, title:"Expected goals", hideSm:true}, {k:"poss", label:"Poss.", num:true, title:"Possession", hideSm:true},
  {k:"points", label:"Pts", num:true, title:"Points", hideSm:true}, {k:"xg_diff", label:"xG Diff", num:true, title:"Goals minus xG"},
];
const colClass = c => [c.num ? "num" : "", c.hideSm ? "hide-sm" : ""].join(" ").trim() || null;
function renderMatchTable(rows){
  const thead = d3.select("#detailTable thead"); thead.html("");
  const htr = thead.append("tr");
  const th = htr.selectAll("th").data(TABLE_COLS).enter().append("th")
    .attr("scope","col")
    .attr("class", colClass)
    .attr("aria-sort", d=> d.k===state.sortCol ? (state.sortDir==="desc" ? "descending" : "ascending") : null);
  th.append("button").attr("type","button").attr("title", d=>d.title ? `Sort by ${d.title.toLowerCase()}` : `Sort by ${d.label.toLowerCase()}`)
    .text(d=>d.label)
    .on("click", (event,d)=>{
      if(state.sortCol===d.k) state.sortDir = state.sortDir==="desc"?"asc":"desc";
      else { state.sortCol = d.k; state.sortDir = "desc"; }
      renderDetail();
      d3.select(`#detailTable th[aria-sort] button`).node()?.focus();
    });

  const toggle = (d)=>{ state.selectedMatch = state.selectedMatch===d ? null : d; renderMatchTable(rows); };
  const tbody = d3.select("#detailTable tbody"); tbody.html("");
  const tr = tbody.selectAll("tr").data(rows).enter().append("tr")
    .attr("tabindex",0)
    .attr("aria-selected", d=> state.selectedMatch===d)
    .on("click",(event,d)=>toggle(d))
    .on("keydown",(event,d)=>{
      if(event.key==="Enter" || event.key===" "){ event.preventDefault(); toggle(d); tbody.selectAll("tr").filter(r=>r===d).node()?.focus(); }
      else if(event.key==="ArrowDown"){ event.preventDefault(); event.currentTarget.nextElementSibling?.focus(); }
      else if(event.key==="ArrowUp"){ event.preventDefault(); event.currentTarget.previousElementSibling?.focus(); }
    });

  // Phones get a compact date and short club names (+ H/A, since the Venue column is hidden there)
  tr.append("td").attr("class","nowrap").html(d=>{ const dt = parseDate(d.date);
    return `<span class="hide-sm">${fmtDateShort(dt)}</span><span class="show-sm">${fmtDateCompact(dt)}</span>`; });
  tr.append("td").html(d=>`<span class="hide-sm">${displayName(d.opponent)}</span><span class="show-sm">${shortName(d.opponent)} <span class="venue-tag">${d.venue==="Home"?"H":"A"}</span></span>`);
  tr.append("td").attr("class","hide-sm").text(d=>d.venue);
  tr.append("td").html(d=>`<span class="result-pill result-${d.result}" title="${resultName(d.result)}">${d.result}</span>`);
  tr.append("td").attr("class","num").text(d=>d.gf);
  tr.append("td").attr("class","num").text(d=>d.ga);
  tr.append("td").attr("class","num hide-sm").text(d=>fmt2(d.xg));
  tr.append("td").attr("class","num hide-sm").text(d=>d.poss+"%");
  tr.append("td").attr("class","num hide-sm").text(d=>d.points);
  tr.append("td").attr("class",d=>"num "+signClass(d.xg_diff)).text(d=>signed(d.xg_diff,2));

  if(!rows.length){
    tbody.append("tr").append("td").attr("colspan", TABLE_COLS.length).attr("class","table-empty")
      .text("No matches with these filters. Try another season, venue or result.");
  }
  d3.select("#detailTableCount").text(`${rows.length} ${rows.length===1 ? "match" : "matches"}`);
  if(state.selectedMatch){
    tbody.selectAll("tr").filter(r=>r===state.selectedMatch).node()?.scrollIntoView({block:"nearest"});
  }
}
