/* Exploratory Analysis view: relationship, distribution, composition, trend and advanced charts.
   Classic script (not a module) so the page still works when opened from disk. */

/* ============================================================
   7.3 RELATIONSHIP — scatter: shots on target vs goals, by venue
   ============================================================ */
const BUBBLE_THRESHOLD = 400;
function renderScatterSotGoals(container){
  const data = fullFiltered();
  if(!data.length){ emptyState(container,"No matches with these filters"); return; }
  const { svg, width, height } = freshSvg(container, 280,
    `Scatter plot of shots on target against goals scored for ${fmtInt(data.length)} results, colored by venue`);
  const margin = { top:10, right:16, bottom:40, left:40 };
  const iw = width-margin.left-margin.right, ih = height-margin.top-margin.bottom;
  const g = svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, d3.max(data,d=>d.sot)+1]).nice().range([0,iw]);
  const y = d3.scaleLinear().domain([0, d3.max(data,d=>d.gf)+1]).nice().range([ih,0]);
  const color = { Home:"var(--home)", Away:"var(--away)" };

  g.append("g").attr("class","gridline").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class","axis").attr("transform",`translate(0,${ih})`).call(d3.axisBottom(x).ticks(6));
  g.append("g").attr("class","axis").call(d3.axisLeft(y).ticks(5));
  axisTitle(g, "Shots on target", iw/2, ih+34);
  axisTitle(g, "Goals scored", -30, ih/2, true);

  if(data.length <= BUBBLE_THRESHOLD){
    // Few enough to show every match: one dot each, click to open it in the detail view.
    d3.select("#exScatterSub").text("Relationship chart with one dot per match, colored by venue. Click a dot to open that match.");
    const dots = g.selectAll("circle").data(data).enter().append("circle")
      .attr("cx",d=>x(Math.max(0, d.sot+jitterOf(d,0,0.35)))).attr("cy",d=>y(Math.max(0, d.gf+jitterOf(d,1,0.35)))).attr("r",4)
      .style("fill", d=>color[d.venue]).attr("opacity",0.55)
      .style("stroke","var(--surface)").attr("stroke-width",0.6);
    bindMark(dots, {
      html: d=>`<div class="tt-title">${displayName(d.team)} vs ${displayName(d.opponent)}</div>` + ttRows([["Date",fmtDateShort(parseDate(d.date))],["Venue",d.venue],["Shots on target",d.sot],["Goals",d.gf],["Result",resultName(d.result)]]),
      onActivate: (event,d)=>{ state.selectedMatch=d; drillToTeam(d.team); },
    });
    dots.on("mouseenter.dot", function(){ d3.select(this).attr("r",6).attr("opacity",0.95); })
      .on("mouseleave.dot", function(){ d3.select(this).attr("r",4).attr("opacity",0.55); });
  } else {
    // Thousands of matches share ~200 (shots, goals) pairs: draw one bubble per pair and venue, sized by count.
    d3.select("#exScatterSub").text("Relationship chart. Bigger bubbles mean more matches, colored by venue.");
    const cells = d3.flatRollup(data, v=>v.length, d=>d.sot, d=>d.gf, d=>d.venue)
      .map(([sot,gf,venue,n])=>({sot,gf,venue,n}));
    const r = d3.scaleSqrt().domain([0, d3.max(cells,c=>c.n)]).range([0, Math.min(11, (x(1)-x(0))*0.55)]);
    const dodge = (x(1)-x(0))*0.18;
    const byPair = d3.group(data, d=>d.sot+"|"+d.gf);
    const bubbles = g.selectAll("circle").data(cells.sort((a,b)=>b.n-a.n)).enter().append("circle")
      .attr("cx",c=>x(c.sot) + (c.venue==="Home" ? -dodge : dodge)).attr("cy",c=>y(c.gf))
      .attr("r",c=>Math.max(2, r(c.n)))
      .style("fill",c=>color[c.venue]).attr("fill-opacity",0.7)
      .style("stroke","var(--surface)").attr("stroke-width",0.8);
    bindMark(bubbles, {
      html: c=>{
        const same = byPair.get(c.sot+"|"+c.gf);
        const home = same.filter(d=>d.venue==="Home").length, away = same.length-home;
        return `<div class="tt-title">${c.sot} shots on target and ${c.gf} goal${c.gf===1?"":"s"}</div>` + ttRows([["Home matches",fmtInt(home)],["Away matches",fmtInt(away)]]);
      },
    });
  }

  const legend = d3.select("#exScatterLegend");
  legend.html("");
  ["Home","Away"].forEach(v=>{
    const item = legend.append("div").attr("class","legend-item");
    item.append("span").attr("class","legend-swatch").style("background",color[v]);
    item.append("span").text(v);
  });
}

/* ============================================================
   Possession vs points scatter (exploratory extra)
   ============================================================ */
function renderScatterPossPoints(container){
  const data = fullFiltered();
  if(!data.length){ emptyState(container,"No matches with these filters"); return; }
  const { svg, width, height } = freshSvg(container, 270,
    `Strip plot of possession percentage against points earned (0, 1 or 3) for ${fmtInt(data.length)} results`);
  const margin = { top:12, right:16, bottom:40, left:36 };
  const iw = width-margin.left-margin.right, ih = height-margin.top-margin.bottom;
  const g = svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain(d3.extent(data,d=>d.poss)).nice().range([0,iw]);
  const y = d3.scaleLinear().domain([-0.4,3.4]).range([ih,0]);

  g.append("g").attr("class","gridline").call(d3.axisLeft(y).tickValues([0,1,3]).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class","axis").attr("transform",`translate(0,${ih})`).call(d3.axisBottom(x).ticks(6).tickFormat(d=>d+"%"));
  g.append("g").attr("class","axis").call(d3.axisLeft(y).tickValues([0,1,3]).tickFormat(d3.format("d")));
  axisTitle(g, "Possession", iw/2, ih+34);
  axisTitle(g, "Points", -26, ih/2, true);

  // Up to 3,800 dots: drawn on canvas, hover handled by a nearest-point search.
  const ctx = canvasLayer(container, width, height);
  ctx.translate(margin.left, margin.top);
  ctx.globalAlpha = 0.45;
  const fills = { W: resultFill("W"), D: resultFill("D"), L: resultFill("L") };
  const pts = data.map(d=>({ x: x(d.poss), y: y(d.points + jitterOf(d,1,0.5)), d }));
  pts.forEach(p=>{ ctx.fillStyle = fills[p.d.result]; ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI*2); ctx.fill(); });
  canvasPointHover(g, pts, iw, ih,
    d=>`<div class="tt-title">${displayName(d.team)} vs ${displayName(d.opponent)}</div>` + ttRows([["Date",fmtDateShort(parseDate(d.date))],["Possession",d.poss+"%"],["Result",resultName(d.result)]]));
}

/* ============================================================
   7.4 DISTRIBUTION — box plot: possession by result
   ============================================================ */
function boxStats(values){
  values = values.slice().sort(d3.ascending);
  const q1 = d3.quantile(values,0.25), med = d3.quantile(values,0.5), q3 = d3.quantile(values,0.75);
  const iqr = q3-q1;
  // Tukey whiskers end at the most extreme data points inside the 1.5×IQR fences
  const lo = d3.min(values.filter(v=>v >= q1-1.5*iqr));
  const hi = d3.max(values.filter(v=>v <= q3+1.5*iqr));
  const outliers = values.filter(v=>v<lo || v>hi);
  return { q1, med, q3, lo, hi, outliers, n: values.length };
}
function renderBoxPlot(container){
  const data = seasonTeamFiltered(); // ignore result filter — the chart groups BY result
  const groups = ["W","D","L"].map(r=>({ r, stats: boxStats(data.filter(d=>d.result===r).map(d=>d.poss)) }))
    .filter(g=>g.stats.n>0);
  if(!groups.length){ emptyState(container,"No matches with these filters"); return; }

  const { svg, width, height } = freshSvg(container, 280,
    "Box plot of possession by match result. " + groups.map(gr=>`${resultName(gr.r)} median ${fmt1(gr.stats.med)}%`).join(", "));
  const margin = { top:10, right:16, bottom:32, left:40 };
  const iw = width-margin.left-margin.right, ih = height-margin.top-margin.bottom;
  const g = svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(groups.map(d=>d.r)).range([0,iw]).padding(0.42);
  const allVals = data.map(d=>d.poss);
  const y = d3.scaleLinear().domain([d3.min(allVals)-3, d3.max(allVals)+3]).range([ih,0]);

  g.append("g").attr("class","gridline").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class","axis").attr("transform",`translate(0,${ih})`)
    .call(d3.axisBottom(x).tickFormat(r=>`${resultName(r)} (n=${fmtInt(groups.find(gr=>gr.r===r).stats.n)})`));
  g.append("g").attr("class","axis").call(d3.axisLeft(y).ticks(5).tickFormat(d=>d+"%"));

  groups.forEach(gr=>{
    const cx = x(gr.r)+x.bandwidth()/2;
    const bw = x.bandwidth();
    const color = resultFill(gr.r);
    g.append("line").attr("x1",cx).attr("x2",cx).attr("y1",y(gr.stats.lo)).attr("y2",y(gr.stats.hi)).attr("stroke",color).attr("stroke-width",1.4);
    [gr.stats.lo, gr.stats.hi].forEach(v=>g.append("line").attr("x1",cx-bw/6).attr("x2",cx+bw/6).attr("y1",y(v)).attr("y2",y(v)).attr("stroke",color).attr("stroke-width",1.4));
    const box = g.append("rect").datum(gr).attr("x",cx-bw/2).attr("width",bw)
      .attr("y",y(gr.stats.q3)).attr("height",Math.max(1,y(gr.stats.q1)-y(gr.stats.q3)))
      .attr("fill",color).attr("fill-opacity",0.22).attr("stroke",color).attr("stroke-width",1.6).attr("rx",4);
    const tip = d=>`<div class="tt-title">${resultName(d.r)}s, ${fmtInt(d.stats.n)} matches</div>` + ttRows([["Median",fmt1(d.stats.med)+"%"],["Middle half",`${fmt1(d.stats.q1)}% to ${fmt1(d.stats.q3)}%`],["Range",`${fmt1(d.stats.lo)}% to ${fmt1(d.stats.hi)}%`]]);
    bindMark(box, { html: tip, label: d=>`${resultName(d.r)}s, median possession ${fmt1(d.stats.med)}%, interquartile range ${fmt1(d.stats.q1)} to ${fmt1(d.stats.q3)}%` });
    g.append("line").attr("x1",cx-bw/2).attr("x2",cx+bw/2).attr("y1",y(gr.stats.med)).attr("y2",y(gr.stats.med)).attr("stroke",color).attr("stroke-width",2.4).attr("pointer-events","none");
    g.selectAll(null).data(gr.stats.outliers).enter().append("circle")
      .attr("cx",(v,i)=>cx+(hash01(gr.r+v+"|"+i)-0.5)*bw*0.5).attr("cy",v=>y(v)).attr("r",2.4)
      .attr("fill",color).attr("opacity",0.5);
  });
}

/* ============================================================
   7.5 COMPOSITION — treemap: total goals by team
   ============================================================ */
function renderTreemap(container){
  const data = leagueFiltered();
  const byTeam = d3.rollups(data, v=>d3.sum(v,d=>d.gf), d=>d.team).filter(r=>r[1]>0);
  if(!byTeam.length){ emptyState(container,"No matches with these filters"); return; }
  const root = d3.hierarchy({children: byTeam.map(([team,goals])=>({team,goals}))})
    .sum(d=>d.goals).sort((a,b)=>b.value-a.value);

  const el = d3.select(container);
  el.selectAll("*").remove();
  const width = chartWidth(el), height = 300;
  d3.treemap().size([width,height]).paddingInner(2).round(true)(root);

  const svg = el.append("svg").attr("width",width).attr("height",height);
  describeSvg(svg, `Treemap of total goals by club. The largest are ${root.leaves().slice(0,3).map(l=>`${displayName(l.data.team)} ${l.data.goals}`).join(", ")}`, true);
  const cell = svg.selectAll("g").data(root.leaves()).enter().append("g")
    .attr("transform",d=>`translate(${d.x0},${d.y0})`);
  bindMark(cell, {
    html: d=>`<div class="tt-title">${displayName(d.data.team)}</div>` + ttRows([["Total goals",fmtInt(d.data.goals)]]),
    label: d=>`${displayName(d.data.team)}, ${d.data.goals} goals. Open club detail`,
    onActivate: (event,d)=>drillToTeam(d.data.team),
  });

  cell.append("rect")
    .attr("width",d=>d.x1-d.x0).attr("height",d=>d.y1-d.y0)
    .attr("fill",d=>teamColor(d.data.team))
    .attr("opacity", d=> (!state.team || state.team===d.data.team) ? 0.92 : 0.28)
    .attr("rx",4);

  cell.filter(d=>(d.x1-d.x0)>40 && (d.y1-d.y0)>24).append("text")
    .attr("class","chart-label").attr("x",6).attr("y",17).style("font-weight",700)
    .style("fill",d=>contrastText(teamColor(d.data.team)))
    .text(d=> teamMeta(d.data.team).abbr);
  cell.filter(d=>(d.x1-d.x0)>52 && (d.y1-d.y0)>40).append("text")
    .attr("class","chart-caption").attr("x",6).attr("y",32)
    .style("fill",d=>contrastText(teamColor(d.data.team))).attr("opacity",0.9)
    .text(d=>d.data.goals+" goals");
}

/* ============================================================
   Supplementary trend: xG per matchweek (selected team)
   ============================================================ */
function renderXgPerMatchweek(container){
  const season = effectiveSeasonForTrend();
  if(!state.team){
    d3.select("#exXgWeekSub").text(`Trend chart for the selected club in ${seasonLabel(season)}`);
    emptyState(container,"Pick a team to see its xG trend","Or select one from any chart or the search box.");
    const top = d3.rollups(RAW_DATA.filter(d=>d.season===season), v=>d3.sum(v,d=>d.points), d=>d.team)
      .sort((a,b)=>d3.descending(a[1],b[1])).slice(0,6).map(r=>r[0]);
    const picks = d3.select(container).select(".chart-empty").append("div").attr("class","quick-picks");
    top.forEach(t=>{
      const b = picks.append("button").attr("type","button").attr("class","team-chip").on("click",()=>setTeam(t));
      b.html(teamBadgeSVG(t,22));
      b.append("span").text(shortName(t));
    });
    return;
  }
  d3.select("#exXgWeekSub").text(`${displayName(state.team)} in ${seasonLabel(season)}. The line is xG and the bars are goals scored.`);
  const rows = RAW_DATA.filter(d=>d.team===state.team && d.season===season)
    .sort((a,b)=>d3.ascending(a.matchweek_num,b.matchweek_num));
  if(!rows.length){ emptyState(container,"No matches for this team in "+seasonLabel(season)); return; }

  const { svg, width, height } = freshSvg(container, 240,
    `Line chart of ${displayName(state.team)} expected goals per matchweek in ${seasonLabel(season)}`);
  const margin = { top:10, right:16, bottom:28, left:32 };
  const iw = width-margin.left-margin.right, ih = height-margin.top-margin.bottom;
  const g = svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain(d3.extent(rows,d=>d.matchweek_num)).range([0,iw]);
  const y = d3.scaleLinear().domain([0, d3.max(rows,d=>Math.max(d.xg,d.gf))+0.5]).nice().range([ih,0]);
  const color = teamInk(state.team);

  g.append("g").attr("class","gridline").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class","axis").attr("transform",`translate(0,${ih})`).call(d3.axisBottom(x).ticks(iw < 360 ? 4 : 6).tickFormat(d=>"MW "+d));
  g.append("g").attr("class","axis").call(d3.axisLeft(y).ticks(4));

  const barW = Math.max(2, Math.min(12, iw/38*0.5));
  g.append("g").selectAll("rect").data(rows).enter().append("rect")
    .attr("x",d=>x(d.matchweek_num)-barW/2).attr("width",barW)
    .attr("y",d=>y(d.gf)).attr("height",d=>ih-y(d.gf)).attr("rx",2)
    .style("fill","var(--border-strong)").attr("pointer-events","none");
  const line = d3.line().x(d=>x(d.matchweek_num)).y(d=>y(d.xg)).curve(d3.curveMonotoneX);
  g.append("path").datum(rows).attr("fill","none").attr("stroke",color).attr("stroke-width",2.4).attr("d",line);
  const dots = g.selectAll("circle").data(rows).enter().append("circle")
    .attr("cx",d=>x(d.matchweek_num)).attr("cy",d=>y(d.xg)).attr("r",3.6).attr("fill",color);
  bindMark(dots, {
    html: d=>`<div class="tt-title">Matchweek ${d.matchweek_num} against ${displayName(d.opponent)}</div>` + ttRows([["xG",fmt2(d.xg)],["Goals scored",d.gf],["Result",resultName(d.result)]]),
  });
}

/* ============================================================
   Supplementary trend: average attendance per season
   ============================================================ */
function renderAttendancePerSeason(container){
  const data = RAW_DATA.filter(d=> matchesVenue(d) && matchesResult(d) && matchesTeam(d) && d.attendance!=null);
  const byseason = ALL_SEASONS.map(s=>({ season:s, avg: d3.mean(data.filter(d=>d.season===s), d=>d.attendance) }))
    .filter(d=>d.avg!=null);
  if(!byseason.length){ emptyState(container,"No attendance data in this scope"); return; }

  const { svg, width, height } = freshSvg(container, 240,
    "Line chart of average attendance per season. " + byseason.map(d=>`${seasonLabel(d.season)} ${fmtInt(Math.round(d.avg))}`).join(", "));
  const margin = { top:18, right:24, bottom:28, left:44 };
  const iw = width-margin.left-margin.right, ih = height-margin.top-margin.bottom;
  const g = svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);

  const x = d3.scalePoint().domain(byseason.map(d=>d.season)).range([0,iw]).padding(0.5);
  const y = d3.scaleLinear().domain([0, d3.max(byseason,d=>d.avg)*1.15]).nice().range([ih,0]);

  g.append("g").attr("class","gridline").call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(""));
  g.append("g").attr("class","axis").attr("transform",`translate(0,${ih})`)
    .call(d3.axisBottom(x).tickFormat(seasonLabel));
  g.append("g").attr("class","axis").call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~s")));

  const line = d3.line().x(d=>x(d.season)).y(d=>y(d.avg)).curve(d3.curveMonotoneX);
  g.append("path").datum(byseason).attr("fill","none").style("stroke","var(--accent)").attr("stroke-width",2.6).attr("d",line);
  const dots = g.selectAll("circle").data(byseason).enter().append("circle")
    .attr("cx",d=>x(d.season)).attr("cy",d=>y(d.avg)).attr("r",4.5).style("fill","var(--accent)");
  bindMark(dots, {
    html: d=>`<div class="tt-title">${seasonLabel(d.season)}</div>` + ttRows([["Average attendance",fmtInt(Math.round(d.avg))]]),
  });
  g.selectAll(".val-label").data(byseason).enter().append("text").attr("class","chart-value")
    .attr("x",d=>x(d.season)).attr("y",d=>y(d.avg)-10).attr("text-anchor","middle")
    .text(d=>d3.format(",.0f")(d.avg));
}

/* ============================================================
   TASK 6-B — ADVANCED: calendar heatmap, points per match date
   ============================================================ */
function renderCalendarHeatmap(container){
  const season = effectiveSeasonForTrend();
  const scoped = leagueFiltered().filter(d=>d.season===season && matchesTeam(d));
  const legend = d3.select(container+"Legend").html("");
  if(!scoped.length){ emptyState(container,"No matches with these filters"); return; }

  const byDate = d3.rollups(scoped, v=>d3.mean(v,d=>d.points), d=>d.date)
    .map(([date,val])=>({ date: parseDate(date), val }));
  const dateMap = new Map(byDate.map(d=>[+d.date, d.val]));

  const minDate = d3.min(byDate,d=>d.date), maxDate = d3.max(byDate,d=>d.date);
  const weekStart = d3.timeMonday.floor(minDate);
  const weeks = d3.timeMonday.range(weekStart, d3.timeDay.offset(maxDate,7));

  const cell = 13, gap = 3;
  const marginL = 32, marginT = 22;
  const width = marginL + weeks.length*(cell+gap) + 10;
  const height = marginT + 7*(cell+gap) + 10;
  const el = d3.select(container); el.selectAll("*").remove();
  const svg = el.append("svg").attr("width", Math.max(width, chartWidth(el))).attr("height",height);
  describeSvg(svg, `Calendar heatmap of average points per match date, ${seasonLabel(season)}, ${byDate.length} match days`);
  const g = svg.append("g").attr("transform",`translate(${marginL},${marginT})`);

  const dayLabels = ["Mon","","Wed","","Fri","","Sun"];
  dayLabels.forEach((lab,i)=>{
    if(!lab) return;
    g.append("text").attr("class","chart-caption").attr("x",-6).attr("y", i*(cell+gap)+cell-2).attr("text-anchor","end").text(lab);
  });

  const color = d3.scaleLinear().domain([0,1,3]).range([cssVar("--heat-0"),cssVar("--heat-1"),cssVar("--heat-3")]).clamp(true);
  const empty = cssVar("--heat-empty");

  legend.append("span").text(`Average points per ${state.team ? "match" : "club"} on each day of ${seasonLabel(season)}`);
  const scale = legend.append("span").attr("class","scale");
  [0,1,2,3].forEach(v=>{ scale.append("span").attr("class","sw").style("background", color(v)); scale.append("span").text(v); });
  const none = legend.append("span").attr("class","scale");
  none.append("span").attr("class","sw").style("background", empty).style("box-shadow","inset 0 0 0 1px var(--border)");
  none.append("span").text("No match");

  weeks.forEach((wk,wi)=>{
    // month label at week columns where month changes
    if(wi===0 || wk.getMonth() !== weeks[wi-1].getMonth()){
      g.append("text").attr("class","chart-caption").attr("x", wi*(cell+gap)).attr("y",-8).style("font-weight",700)
        .text(d3.timeFormat("%b")(wk));
    }
    for(let di=0; di<7; di++){
      const day = d3.timeDay.offset(wk, di);
      const val = dateMap.get(+day);
      const rect = g.append("rect")
        .attr("x", wi*(cell+gap)).attr("y", di*(cell+gap)).attr("width",cell).attr("height",cell).attr("rx",3)
        .attr("fill", val!=null ? color(val) : empty);
      if(val!=null){
        rect.style("cursor","pointer")
          .on("mouseenter",function(event){
            d3.select(this).style("stroke","var(--accent)").attr("stroke-width",1.5);
            showTooltip(`<div class="tt-title">${fmtDateShort(day)}</div>` + ttRows([["Average points",fmt2(val)]]), event);
          })
          .on("mousemove",moveTooltip)
          .on("mouseleave",function(){ d3.select(this).style("stroke",null); hideTooltip(); });
      }
    }
  });
}

/* ============================================================
   TASK 6-D — ADVANCED: parallel coordinates
   axes: points, xG differential, possession, shots on target
   ============================================================ */
function renderParallelCoordinates(container){
  const scoped = leagueFiltered();
  const byTeam = d3.rollups(scoped, v=>({
    points: d3.mean(v,d=>d.points), xg_diff: d3.mean(v,d=>d.xg_diff),
    poss: d3.mean(v,d=>d.poss), sot: d3.mean(v,d=>d.sot),
  }), d=>d.team).map(([team,vals])=>({team,...vals}));
  if(!byTeam.length){ emptyState(container,"No matches with these filters"); return; }

  // Highlight a few lines instead of drawing 27 equal ones: the selected club, or else the top and bottom three
  const ranked = byTeam.slice().sort((a,b)=>b.points-a.points);
  const top = new Set(ranked.slice(0,3).map(d=>d.team));
  const bottom = new Set(ranked.length > 6 ? ranked.slice(-3).map(d=>d.team) : []);
  const isHi = d => state.team ? d.team===state.team : (top.has(d.team) || bottom.has(d.team));
  const hiColor = d => state.team ? teamInk(d.team) : top.has(d.team) ? cssVar("--win") : cssVar("--loss");
  d3.select("#exParallelSub").text(state.team
    ? `${displayName(state.team)} against every other club on points, xG differential, possession and shots on target. Hover any line for details.`
    : "Green lines are the top three clubs by points per match and red lines the bottom three. Hover any grey line to see that club.");

  const el = d3.select(container); el.selectAll("*").remove();
  const w0 = chartWidth(el);
  const narrow = w0 < 480;
  const dims = [
    { key:"points", label: narrow ? "Pts per match" : "Points per match", fmt:fmt2 },
    { key:"xg_diff", label: narrow ? "xG diff" : "xG differential", fmt:d=>signed(d,2) },
    { key:"poss", label: narrow ? "Poss." : "Possession", fmt:d=>fmt1(d)+"%" },
    { key:"sot", label: narrow ? "On target" : "Shots on target", fmt:fmt1 },
  ];

  const { svg, width, height } = freshSvg(container, 300,
    `Parallel coordinates of ${byTeam.length} clubs across points per match, xG differential, possession and shots on target. ` +
    (state.team ? `${displayName(state.team)} is highlighted.` : `Top three ${[...top].map(displayName).join(", ")}. Bottom three ${[...bottom].map(displayName).join(", ")}.`));
  describeSvg(svg, svg.attr("aria-label"), true);
  const labels = !narrow;
  const margin = { top:30, right: labels ? 118 : 24, bottom:14, left:40 };
  const iw = width-margin.left-margin.right, ih = height-margin.top-margin.bottom;
  const g = svg.append("g").attr("transform",`translate(${margin.left},${margin.top})`);

  const x = d3.scalePoint().domain(dims.map(d=>d.key)).range([0,iw]);
  const y = {};
  dims.forEach(d=>{ y[d.key] = d3.scaleLinear().domain(d3.extent(byTeam,r=>r[d.key])).nice().range([ih,0]); });

  const lineGen = d => d3.line()(dims.map(dim=>[x(dim.key), y[dim.key](d[dim.key])]));
  const restStroke = d => isHi(d) ? hiColor(d) : cssVar("--chart-neutral");
  const restOpacity = d => isHi(d) ? 1 : 0.22;
  const restWidth = d => isHi(d) ? 2.6 : 1.2;

  // Grey lines first so the highlighted ones sit on top
  const lines = g.selectAll(".pc-line").data(byTeam.slice().sort((a,b)=>isHi(a)-isHi(b))).enter().append("path")
    .attr("class","pc-line")
    .attr("d", lineGen).attr("fill","none").attr("stroke-linejoin","round")
    .attr("stroke", restStroke).attr("stroke-width", restWidth).attr("opacity", restOpacity);
  bindMark(lines, {
    html: d=>`<div class="tt-title">${displayName(d.team)}</div>` + dims.map(dim=>`<div class="tt-row"><span>${dim.label}</span><b>${dim.fmt(d[dim.key])}</b></div>`).join(""),
    label: d=>`${displayName(d.team)}, ` + dims.map(dim=>`${dim.label} ${dim.fmt(d[dim.key])}`).join(", "),
    onActivate: (event,d)=>setTeam(d.team),
  });
  lines.on("mouseenter.hl focus.hl", function(event,d){ d3.select(this).raise().attr("opacity",1).attr("stroke-width",3).attr("stroke", teamInk(d.team)); })
    .on("mouseleave.hl blur.hl", function(event,d){
      d3.select(this).attr("opacity", restOpacity(d)).attr("stroke-width", restWidth(d)).attr("stroke", restStroke(d));
    });

  dims.forEach((dim,i)=>{
    g.append("g").attr("transform",`translate(${x(dim.key)},0)`).attr("class","axis").call(d3.axisLeft(y[dim.key]).ticks(4));
    const anchor = i===0 ? "start" : (i===dims.length-1 && !labels) ? "end" : "middle";
    const dx = i===0 ? -margin.left+4 : (i===dims.length-1 && !labels) ? margin.right-4 : 0;
    g.append("text").attr("class","chart-axis-title").attr("x",x(dim.key)+dx).attr("y",-14).attr("text-anchor",anchor).text(dim.label);
  });

  // Name the highlighted clubs at the right-hand end, nudged apart so they never overlap
  if(labels){
    const last = dims[dims.length-1].key;
    const tags = byTeam.filter(isHi).map(d=>({ d, y: y[last](d[last]) })).sort((a,b)=>a.y-b.y);
    for(let i=1; i<tags.length; i++) tags[i].y = Math.max(tags[i].y, tags[i-1].y + 13);
    const over = tags.length ? tags[tags.length-1].y - ih : 0;
    if(over > 0) tags.forEach(t=>t.y -= over);
    const tg = g.append("g").selectAll("g").data(tags).enter().append("g")
      .attr("transform", t=>`translate(${iw + 10},${t.y})`).style("cursor","pointer")
      .on("click", (event,t)=>setTeam(t.d.team));
    tg.append("circle").attr("r",3.5).attr("fill", t=>hiColor(t.d));
    tg.append("text").attr("class","chart-label").attr("x",8).attr("dominant-baseline","middle")
      .text(t=>shortName(t.d.team)).call(fitText, margin.right - 22);
  }
}

/* ============================================================
   TASK 6-E — ADVANCED: scatter plot matrix
   variables: goals, xG, possession, shots, shots on target
   Lower triangle: scatter (canvas). Upper triangle: Pearson r on
   every match in scope. Diagonal: variable name.
   ============================================================ */
const MATRIX_SAMPLE = 500;
function pearson(data, a, b){
  const ma = d3.mean(data, d=>d[a]), mb = d3.mean(data, d=>d[b]);
  let num = 0, da = 0, db = 0;
  for(const d of data){ const x = d[a]-ma, y = d[b]-mb; num += x*y; da += x*x; db += y*y; }
  return da && db ? num/Math.sqrt(da*db) : 0;
}
function renderScatterMatrix(container){
  const all = fullFiltered();
  if(!all.length){ emptyState(container,"No matches with these filters"); return; }
  // Fixed pseudo-random sample (stable across redraws) keeps the plots readable
  const sampled = all.length > MATRIX_SAMPLE;
  const data = sampled ? all.slice().sort((a,b)=>JITTER.get(a)[0]-JITTER.get(b)[0]).slice(0, MATRIX_SAMPLE) : all;
  const vars = [
    {key:"gf",label:"Goals"}, {key:"xg",label:"xG"}, {key:"poss",label:"Possession"},
    {key:"sh",label:"Shots"}, {key:"sot",label:"On target"},
  ];
  const el = d3.select(container); el.selectAll("*").remove();
  // Measure at full width first: once centred with auto margins inside the flex card it would shrink-wrap to 0
  el.style("width", null).style("margin", null);
  const size = Math.min(chartWidth(el), 720);
  const n = vars.length, cellSize = size/n, pad = 6;
  el.style("width", size+"px").style("margin", "0 auto");
  const svg = el.append("svg").attr("width",size).attr("height",size);
  const rs = [];
  vars.forEach((a,i)=>vars.forEach((b,j)=>{ if(j>i) rs.push(`${a.label} and ${b.label} r=${fmt2(pearson(all,a.key,b.key))}`); }));
  describeSvg(svg, `Scatter plot matrix for ${fmtInt(all.length)} matches. Correlations are ${rs.join(", ")}`);

  const ctx = canvasLayer(container, size, size);
  const scales = {};
  vars.forEach(v=>{ scales[v.key] = d3.scaleLinear().domain(d3.extent(data,d=>d[v.key])).nice().range([pad, cellSize-pad]); });
  const neutral = cssVar("--chart-neutral"), accent = cssVar("--accent"), cellBg = cssVar("--surface-2");
  const rColor = d3.scaleLinear().domain([-1,0,1]).range([cssVar("--loss"), cssVar("--surface-2"), cssVar("--brand-ink")]);
  const tip = (vx,vy)=>d=>`<div class="tt-title">${displayName(d.team)} vs ${displayName(d.opponent)}</div>` + ttRows([[vx.label,d[vx.key]],[vy.label,d[vy.key]]]);

  vars.forEach((vy,ri)=>{
    vars.forEach((vx,ci)=>{
      const cg = svg.append("g").attr("transform",`translate(${ci*cellSize},${ri*cellSize})`);
      // Scatter cells get their background on the canvas (the SVG sits above it and must stay transparent there)
      const bg = ci < ri ? cg : cg.append("rect").attr("width",cellSize-2).attr("height",cellSize-2).attr("x",1).attr("y",1).attr("rx",4)
        .style("fill","var(--surface-2)");
      if(ri===ci){
        cg.append("text").attr("class","chart-axis-title").attr("x",cellSize/2).attr("y",cellSize/2).attr("text-anchor","middle").attr("dominant-baseline","middle").text(vx.label);
      } else if(ci > ri){
        const r = pearson(all, vx.key, vy.key);
        bg.style("fill", null).attr("fill", rColor(r));
        cg.append("text").attr("class","chart-label").attr("x",cellSize/2).attr("y",cellSize/2).attr("text-anchor","middle").attr("dominant-baseline","middle")
          .style("fill", contrastText(rColor(r))).style("font-size", cellSize > 90 ? "var(--fs-md)" : "var(--fs-xs)").text("r = " + fmt2(r));
      } else {
        const xs = scales[vx.key], ys = scales[vy.key];
        const pts = data.map(d=>({ x: xs(d[vx.key]), y: cellSize - ys(d[vy.key]), d }));
        ctx.save(); ctx.translate(ci*cellSize, ri*cellSize);
        ctx.globalAlpha = 1; ctx.fillStyle = cellBg;
        ctx.beginPath(); ctx.roundRect(1, 1, cellSize-2, cellSize-2, 4); ctx.fill();
        for(const p of pts){
          const on = !state.team || p.d.team===state.team;
          ctx.globalAlpha = on ? 0.5 : 0.12;
          ctx.fillStyle = state.team && on ? accent : neutral;
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.8, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
        canvasPointHover(cg, pts, cellSize, cellSize, tip(vx,vy));
      }
    });
  });
  d3.select("#exMatrixNote").text(
    (sampled ? `The dots show a fixed sample of ${MATRIX_SAMPLE} of ${fmtInt(all.length)} matches. ` : `The dots show all ${fmtInt(all.length)} matches with these filters. `) +
    "The upper right shows the correlation (r) across every match, where 1 is a perfect positive relationship and 0 is none.");
}

/* ============================================================
   VIEW 2 — EXPLORATORY ANALYSIS
   ============================================================ */
function renderExplore(){
  renderScatterSotGoals("#exScatter");
  renderBoxPlot("#exBox");
  renderTreemap("#exTreemap");
  renderXgPerMatchweek("#exXgWeek");
  renderAttendancePerSeason("#exAttendance");
  renderScatterPossPoints("#exPossPoints");
  renderComparisonBarChart("#exCompareFull", false);
  renderCalendarHeatmap("#exCalendar");
  renderParallelCoordinates("#exParallel");
  renderScatterMatrix("#exMatrix");
}
