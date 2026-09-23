/* Executive Overview view: KPIs, key finding, cumulative points trend, W/D/L bars.
   Classic script (not a module) so the page still works when opened from disk. */

/* ============================================================
   VIEW 1 — EXECUTIVE OVERVIEW
   ============================================================ */
function computeKPIs(){
  const scoped = fullFiltered();                 // season+venue+result+team
  const leagueScoped = leagueFiltered();          // season+venue+result (all teams)
  const seasonTeamScoped = seasonTeamFiltered();  // season+team (both venues, all results)

  const avgPoints = d3.mean(scoped, d=>d.points) ?? 0;
  const avgXgDiff = d3.mean(scoped, d=>d.xg_diff) ?? 0;

  // Top team / rank
  const byTeamPts = d3.rollups(leagueScoped, v=>d3.sum(v,d=>d.points), d=>d.team)
    .sort((a,b)=>d3.descending(a[1],b[1]));
  let kpi3Label, kpi3Value, kpi3Context;
  if(state.team){
    const idx = byTeamPts.findIndex(r=>r[0]===state.team);
    kpi3Label = "Club Rank";
    kpi3Value = idx>=0 ? `${ordinal(idx+1)} <small>of ${byTeamPts.length}</small>` : "None";
    kpi3Context = idx>=0 ? `${displayName(state.team)} has ${fmtInt(byTeamPts[idx][1])} points with these filters` : "No matches with these filters";
  } else {
    kpi3Label = "Top Club";
    kpi3Value = byTeamPts.length ? displayName(byTeamPts[0][0]) : "None";
    kpi3Context = byTeamPts.length ? `${fmtInt(byTeamPts[0][1])} points with these filters` : "";
  }

  // Home vs away gap
  const home = seasonTeamScoped.filter(d=>d.venue==="Home");
  const away = seasonTeamScoped.filter(d=>d.venue==="Away");
  const homeWin = home.length ? d3.mean(home, d=> d.result==="W"?1:0)*100 : null;
  const awayWin = away.length ? d3.mean(away, d=> d.result==="W"?1:0)*100 : null;

  return { avgPoints, avgXgDiff, kpi3Label, kpi3Value, kpi3Context, homeWin, awayWin };
}

/** Delta vs the all-data average. Omitted when nothing is filtered (it would always read "+0.00"). */
function kpiCompareRow(current, baseline, digits){
  if(isUnfiltered()) return "";
  const diff = current - baseline;
  const cls = Math.abs(diff) < 0.005 ? "flat" : diff>0 ? "up" : "down";
  const arrow = cls==="flat" ? "→" : cls==="up" ? "↑" : "↓";
  return `<div class="kpi-compare ${cls}"><span aria-hidden="true">${arrow}</span> ${signed(diff,digits)} against the overall average of ${fmt2(baseline)}</div>`;
}

function renderKPIs(){
  const k = computeKPIs();
  const wrap = d3.select("#kpiRow");
  wrap.html("");
  const scopeText = state.team ? `${displayName(state.team)}, ${seasonLabel(state.season).toLowerCase()}` : `Whole league, ${seasonLabel(state.season).toLowerCase()}`;

  const c1 = wrap.append("div").attr("class","kpi-card");
  c1.append("div").attr("class","kpi-label").text("Average Points per Match");
  c1.append("div").attr("class","kpi-value").html(`${fmt2(k.avgPoints)} <small>of 3</small>`);
  c1.append("div").html(kpiCompareRow(k.avgPoints, OVERALL.avgPoints, 2));
  c1.append("div").attr("class","kpi-context").text(scopeText);

  const c2 = wrap.append("div").attr("class","kpi-card");
  c2.append("div").attr("class","kpi-label").text("Average xG Differential");
  c2.append("div").attr("class","kpi-value").html(`${signed(k.avgXgDiff,2)} <small>per match</small>`);
  c2.append("div").html(kpiCompareRow(k.avgXgDiff, OVERALL.avgXgDiff, 2));
  c2.append("div").attr("class","kpi-context").text("Goals scored minus expected goals (xG)");

  const c3 = wrap.append("div").attr("class","kpi-card");
  c3.append("div").attr("class","kpi-label").text(k.kpi3Label);
  c3.append("div").attr("class","kpi-value" + (state.team ? "" : " is-text")).html(k.kpi3Value);
  c3.append("div").attr("class","kpi-context").text(k.kpi3Context);

  const c4 = wrap.append("div").attr("class","kpi-card");
  c4.append("div").attr("class","kpi-label").text("Home Win Rate");
  c4.append("div").attr("class","kpi-value").html(k.homeWin!=null ? `${fmt1(k.homeWin)}<small>%</small>` : "None");
  const gap = (k.homeWin!=null && k.awayWin!=null) ? (k.homeWin - k.awayWin) : null;
  c4.append("div").attr("class", "kpi-compare " + (gap==null?"flat":gap>=0?"up":"down"))
    .text(gap==null ? "Not enough data" : `${Math.abs(gap) < 0.05 ? "Level with" : fmt1(Math.abs(gap)) + " percentage points " + (gap>0 ? "above" : "below")} the ${fmt1(k.awayWin)}% away win rate`);
  c4.append("div").attr("class","kpi-context").text("Share of home matches won, compared with away matches");
}

function renderFinding(){
  // team with most negative average xG differential, within current season/venue/result scope
  const scoped = leagueFiltered();
  const byTeam = d3.rollups(scoped, v=>d3.mean(v,d=>d.xg_diff), d=>d.team)
    .filter(r=>!isNaN(r[1]))
    .sort((a,b)=>d3.ascending(a[1],b[1]));
  const box = d3.select("#findingBanner");
  if(!byTeam.length){ box.classed("hidden",true); return; }
  box.classed("hidden",false);
  const [team, val] = byTeam[0];
  box.select(".finding-text").html(
    `<b>${displayName(team)}</b> shows the largest negative average xG differential with these filters, at <b>${signedTypo(val,2)} goals per match</b>. `+
    `It is scoring fewer goals than its chances suggest, so its finishing is worth a closer look.`
  );
}

function renderOverview(){
  renderKPIs();
  renderFinding();
  renderTrendChart("#ovTrendChart");
  renderComparisonBarChart("#ovCompareChart", true);
}

/* ============================================================
   7.2 TREND CHART — cumulative points across a season
   (with two supplementary trend charts: xG/matchweek, attendance/season)
   ============================================================ */
function renderTrendChart(container){
  const season = effectiveSeasonForTrend();
  const seasonData = RAW_DATA.filter(d=>d.season===season);
  const byTeamTotal = d3.rollups(seasonData, v=>d3.sum(v,d=>d.points), d=>d.team)
    .sort((a,b)=>d3.descending(a[1],b[1]));

  let teams;
  if(state.team){
    const top5 = byTeamTotal.filter(r=>r[0]!==state.team).slice(0,5).map(r=>r[0]);
    teams = [state.team, ...top5];
  } else {
    teams = byTeamTotal.slice(0,6).map(r=>r[0]);
  }
  d3.select("#ovTrendSub").text(`${seasonLabel(season)} season, ${state.team ? "the selected club and the top five" : "the top six clubs by points"}. Hover to see the table at any matchweek and click a line to select a club.`);

  const series = teams.map(team=>{
    const rows = seasonData.filter(d=>d.team===team).sort((a,b)=>d3.ascending(a.matchweek_num,b.matchweek_num));
    let cum = 0;
    const pts = rows.map(r=>{ cum += r.points; return { mw:r.matchweek_num, cum }; });
    return { team, pts, color: teamInk(team), byMw: new Map(pts.map(p=>[p.mw,p.cum])) };
  });

  const { svg, width, height } = freshSvg(container, 300,
    `Line chart of cumulative points by matchweek in ${seasonLabel(season)}. ` +
    series.map(s=>`${displayName(s.team)} ${s.pts.length ? s.pts[s.pts.length-1].cum : 0} points`).join(", "));
  describeSvg(svg, svg.attr("aria-label") + ". Focus the chart and use the arrow keys to step through matchweeks.", true);
  // Direct end-of-line labels when there is room; the legend below covers narrow screens.
  const endLabels = width >= 560;
  const margin = { top:12, right: endLabels ? 118 : 16, bottom:28, left:34 };
  const iw = width - margin.left - margin.right, ih = height - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([1,38]).range([0,iw]);
  const yMax = d3.max(series, s=>d3.max(s.pts, p=>p.cum)) || 10;
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([ih,0]);

  g.append("g").attr("class","gridline").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class","axis").attr("transform",`translate(0,${ih})`)
    .call(d3.axisBottom(x).ticks(iw < 360 ? 4 : 8).tickFormat(d=>"MW "+d));
  g.append("g").attr("class","axis").call(d3.axisLeft(y).ticks(5));

  // Crosshair overlay sits under the lines so the lines stay clickable
  const overlay = g.append("rect").attr("width",iw).attr("height",ih).attr("fill","transparent");

  const line = d3.line().x(d=>x(d.mw)).y(d=>y(d.cum)).curve(d3.curveMonotoneX);
  const emphasis = s=> !state.team || s.team===state.team;
  // De-emphasised series first so the selected team is drawn on top
  const ordered = series.slice().sort((a,b)=>emphasis(a)-emphasis(b));
  g.append("g").attr("pointer-events","none").selectAll("path").data(ordered).enter().append("path")
    .attr("fill","none").attr("stroke",s=>s.color).attr("stroke-linejoin","round").attr("stroke-linecap","round")
    .attr("stroke-width", s=> state.team===s.team ? 3.2 : 2)
    .attr("opacity", s=> emphasis(s) ? 1 : 0.3)
    .attr("d", s=>line(s.pts));
  // Wide invisible strokes make thin lines easy to hit
  const hit = g.append("g").selectAll("path").data(ordered).enter().append("path")
    .attr("fill","none").attr("stroke","transparent").attr("stroke-width",12).attr("d", s=>line(s.pts))
    .style("cursor","pointer").on("click",(event,s)=>setTeam(s.team));

  if(endLabels){
    const labels = series.filter(s=>s.pts.length).map(s=>{ const last = s.pts[s.pts.length-1]; return { s, x: x(last.mw), y: y(last.cum), cum: last.cum }; })
      .sort((a,b)=>a.y-b.y);
    // Nudge labels apart so they never overlap (min 13px), then keep them inside the plot
    for(let i=1; i<labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i-1].y + 13);
    const overflow = labels.length ? labels[labels.length-1].y - ih : 0;
    if(overflow > 0) labels.forEach(l=>l.y -= overflow);
    const lg = g.append("g").selectAll("g").data(labels).enter().append("g")
      .attr("transform", l=>`translate(${l.x + 8},${l.y})`).style("cursor","pointer")
      .attr("opacity", l=> emphasis(l.s) ? 1 : 0.55)
      .on("click",(event,l)=>setTeam(l.s.team));
    // Neutral text (always ≥ 4.5:1) with a colour dot; club colours alone can be too faint as text
    lg.append("circle").attr("r",3.5).attr("cx",0).attr("fill", l=>l.s.color);
    lg.append("text").attr("class","chart-label").attr("x",8).attr("dominant-baseline","middle")
      .text(l=>`${l.cum}  ${shortName(l.s.team)}`).call(fitText, margin.right - 20);
  }

  // Crosshair: standings at any matchweek (mouse, or arrow keys once the chart is focused)
  const guide = g.append("line").attr("y1",0).attr("y2",ih).style("stroke","var(--text-3)").attr("stroke-dasharray","3,3")
    .attr("opacity",0).attr("pointer-events","none");
  const marks = g.append("g").attr("pointer-events","none").selectAll("circle").data(series).enter().append("circle")
    .attr("r",4).attr("fill",s=>s.color).style("stroke","var(--surface)").attr("stroke-width",1.5).attr("opacity",0);
  let mw = null;
  const standingsAt = w => series.map(s=>({ s, cum: s.byMw.get(w) })).filter(r=>r.cum!=null).sort((a,b)=>b.cum-a.cum);
  const tipHtml = w => `<div class="tt-title">Matchweek ${w}</div>` +
    standingsAt(w).map(r=>`<div class="tt-row"><span class="tt-swatch" style="background:${r.s.color}"></span><span>${displayName(r.s.team)}</span><b>${r.cum}</b></div>`).join("");
  const showAt = (w, event)=>{
    mw = Math.max(1, Math.min(38, w));
    guide.attr("x1",x(mw)).attr("x2",x(mw)).attr("opacity",1);
    marks.attr("cx",x(mw)).attr("cy",s=>{ const c = s.byMw.get(mw); return c==null ? -99 : y(c); })
      .attr("opacity",s=> s.byMw.has(mw) ? 1 : 0);
    if(event) showTooltip(tipHtml(mw), event);
    else {
      const r = guide.node().getBoundingClientRect();
      tooltip.html(tipHtml(mw)).style("opacity",1);
      placeTooltip(r.left, r.top + 20);
      announce(`Matchweek ${mw}. ` + standingsAt(mw).map(r=>`${displayName(r.s.team)} ${r.cum}`).join(", "));
    }
  };
  const hide = ()=>{ guide.attr("opacity",0); marks.attr("opacity",0); hideTooltip(); };
  const track = function(event){ showAt(Math.round(x.invert(d3.pointer(event, g.node())[0])), event); };
  // Listen on the whole plot group: moving between the background and a line stays inside it, so the tooltip never flickers
  g.on("mousemove", track).on("mouseleave", hide);

  svg.attr("tabindex",0)
    .on("focus", ()=>showAt(mw || 38))
    .on("blur", hide)
    .on("keydown", event=>{
      const step = { ArrowRight:1, ArrowLeft:-1, Home:-38, End:38 }[event.key];
      if(step==null) return;
      event.preventDefault();
      showAt((mw || 38) + step);
    });

  const legend = d3.select(container.replace("Chart","Legend"));
  if(!legend.empty()){
    legend.html("");
    teams.forEach(t=>{
      const item = legend.append("button").attr("type","button").attr("class","legend-item")
        .attr("aria-pressed", state.team===t)
        .style("opacity", (!state.team || state.team===t) ? 1 : 0.55)
        .on("click", ()=>setTeam(t));
      item.append("span").attr("class","legend-swatch").style("background",teamInk(t));
      item.append("span").text(displayName(t));
    });
  }
}

/* ============================================================
   7.1 COMPARISON CHART — W/D/L per team (stacked horizontal bar)
   ============================================================ */
function renderComparisonBarChart(container, compact){
  const scoped = leagueFiltered();
  let byTeam = d3.rollups(scoped, v=>({
    W: v.filter(d=>d.result==="W").length,
    D: v.filter(d=>d.result==="D").length,
    L: v.filter(d=>d.result==="L").length,
  }), d=>d.team).map(([team,c])=>({team,...c, total:c.W+c.D+c.L}));
  byTeam.sort((a,b)=> d3.descending(a.W,b.W) || d3.ascending(a.L,b.L));
  if(compact) byTeam = byTeam.slice(0,10);
  if(!byTeam.length){ emptyState(container,"No matches with these filters"); return; }

  const el = d3.select(container);
  el.selectAll("*").remove();
  const width = chartWidth(el);
  const narrow = width < 480;
  const rowH = 26;
  const margin = { top:4, right:36, bottom:4, left: narrow ? 96 : 150 };
  const height = byTeam.length*rowH + margin.top + margin.bottom;
  const iw = width - margin.left - margin.right, ih = height - margin.top - margin.bottom;
  const svg = el.append("svg").attr("width",width).attr("height",height);
  describeSvg(svg, `Stacked bar chart of wins, draws and losses for ${byTeam.length} clubs, sorted by wins`, true);
  const g = svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);

  const y = d3.scaleBand().domain(byTeam.map(d=>d.team)).range([0,ih]).paddingInner(0.3);
  const x = d3.scaleLinear().domain([0, d3.max(byTeam,d=>d.total)||1]).range([0,iw]);
  const keys = ["W","D","L"];

  const rows = g.selectAll(".bar-row").data(byTeam).enter().append("g")
    .attr("class", d=> "bar-row" + (state.team && state.team!==d.team ? " dim":""))
    .attr("transform", d=>`translate(0,${y(d.team)})`);
  bindMark(rows, {
    html: d=>`<div class="tt-title">${displayName(d.team)}</div>` + ttRows([["Wins",d.W],["Draws",d.D],["Losses",d.L],["Matches",d.total]]),
    label: d=>`${displayName(d.team)}, ${d.W} wins, ${d.D} draws and ${d.L} losses`,
    onActivate: (event,d)=>setTeam(d.team),
  });

  rows.append("text").attr("class","chart-label")
    .attr("x", -8).attr("y", y.bandwidth()/2).attr("text-anchor","end").attr("dominant-baseline","middle")
    .text(d=> narrow ? shortName(d.team) : displayName(d.team))
    .call(fitText, margin.left - 12);

  keys.forEach((k,i)=>{
    const x0 = d=> x(keys.slice(0,i).reduce((s,kk)=>s+d[kk],0));
    rows.append("rect")
      .attr("x",x0).attr("y",0).attr("height",y.bandwidth())
      .attr("width",d=>Math.max(0, x(d[k]) - (i<2 ? 1 : 0))).style("fill",`var(${RESULT_TOKEN[k]})`);
    rows.append("text").attr("class","chart-label")
      .attr("x",d=>x0(d)+x(d[k])/2).attr("y",y.bandwidth()/2).attr("text-anchor","middle").attr("dominant-baseline","middle")
      .text(d=> x(d[k]) >= 24 ? d[k] : "");
  });
  rows.append("text").attr("class","chart-value")
    .attr("x",d=>x(d.total)+6).attr("y",y.bandwidth()/2).attr("dominant-baseline","middle")
    .text(d=>d.total);
}
