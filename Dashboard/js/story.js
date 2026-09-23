/* Story and Insights view: narrative computed from the data.
   Classic script (not a module) so the page still works when opened from disk. */

/* ============================================================
   VIEW 4 — STORY (built once; static narrative content)
   ============================================================ */
/* Dataset-wide narrative. Every figure is computed from RAW_DATA so the story can't drift from the data;
   it covers the whole dataset and ignores the filters on purpose. */
const NUMBER_WORDS = ["zero","one","two","three","four","five","six","seven","eight","nine","ten"];
/** Signed number with a true minus sign (U+2212), e.g. −0.25 / +0.32 */
function signedTypo(n, digits){ return (n<0 ? "−" : "+") + Math.abs(n).toFixed(digits==null?2:digits); }
function storyStats(){
  const D = RAW_DATA;
  const bySeasonGoals = ALL_SEASONS.map(s=>({ season:s, gpm: d3.mean(D.filter(d=>d.season===s), d=>d.gf) }));
  const first = bySeasonGoals[0], last = bySeasonGoals[bySeasonGoals.length-1];
  const peak = bySeasonGoals.reduce((a,b)=> b.gpm > a.gpm ? b : a);
  const upToPeak = bySeasonGoals.slice(0, bySeasonGoals.indexOf(peak)+1);
  const home = d3.mean(D.filter(d=>d.venue==="Home"), d=>d.result==="W"?1:0)*100;
  const away = d3.mean(D.filter(d=>d.venue==="Away"), d=>d.result==="W"?1:0)*100;
  const xgByTeam = d3.rollups(D, v=>d3.mean(v,d=>d.xg_diff), d=>d.team).sort((a,b)=>a[1]-b[1]);
  const ptsByTeam = d3.rollups(D, v=>d3.sum(v,d=>d.points), d=>d.team).sort((a,b)=>b[1]-a[1]);
  const period = p => d3.mean(D.filter(d=>d.season_period===p), d=>d.points);
  return {
    clubs: new Set(D.map(d=>d.team)).size, seasons: ALL_SEASONS.length,
    avgPts: d3.mean(D, d=>d.points), avgGoals: d3.mean(D, d=>d.gf),
    first, last, peak, steady: upToPeak.every((s,i)=> i===0 || s.gpm >= upToPeak[i-1].gpm),
    rise: (peak.gpm/first.gpm - 1)*100,
    home, away,
    worst: xgByTeam.slice(0,2), best: xgByTeam[xgByTeam.length-1],
    top: ptsByTeam[0],
    highShare: d3.mean(D, d=>d.high_scoring_flag?1:0)*100,
    early: period("Early season"), late: period("Late season"),
    rShots: pearson(D, "sh", "sot"), rPossGoals: pearson(D, "poss", "gf"),
  };
}
let storyRendered = false;
function renderStory(){
  if(storyRendered) return;
  storyRendered = true;
  const S = storyStats();
  const [w1, w2] = S.worst, best = S.best;
  const sl = s => seasonLabel(s.season);
  const blocks = [
    ["Context", `This dashboard covers Premier League results from ${seasonLabel(S.first.season)} to ${seasonLabel(S.last.season)}. Across ${NUMBER_WORDS[S.seasons] || S.seasons} seasons, ${S.clubs} clubs averaged ${fmt2(S.avgPts)} points and ${fmt2(S.avgGoals)} goals per match.`],
    ["Pattern", `Scoring ${S.steady ? "went up every season" : "rose overall"}, from ${fmt2(S.first.gpm)} goals per match in ${sl(S.first)} to ${fmt2(S.peak.gpm)} in ${sl(S.peak)}` +
      (S.peak !== S.last ? `, then eased back to ${fmt2(S.last.gpm)} in ${sl(S.last)}` : "") +
      `. Home advantage held steady throughout, with home sides winning ${fmt1(S.home)}% of matches and away sides ${fmt1(S.away)}%.`],
    ["Explanation", `In the scatter plot matrix, shots and shots on target move closely together (r = ${fmt2(S.rShots)}). Possession has a much weaker link with goals scored (r = ${fmt2(S.rPossGoals)}). Having more of the ball does not reliably lead to more goals, and the possession box plot backs this up because the ranges for wins, draws and losses overlap heavily.`],
    ["Risk or Opportunity", `${displayName(w1[0])} and ${displayName(w2[0])} have the most negative average xG differentials, at ${signedTypo(w1[1])} and ${signedTypo(w2[1])} goals per match. Both scored fewer goals than their chances deserved. ${displayName(best[0])} is at the other end with ${signedTypo(best[1])}, scoring more than its chances suggested.`],
  ];
  const sb = d3.select("#storyBlocks").html("");
  blocks.forEach(([h,p])=>{ const b = sb.append("div").attr("class","story-block"); b.append("h3").text(h); b.append("p").text(p); });

  const insights = [
    `${displayName(S.top[0])} collected ${fmtInt(S.top[1])} total points across the ${NUMBER_WORDS[S.seasons] || S.seasons} seasons, more than any other club. That points to sustained strength rather than one good year.`,
    `Scoring across the league rose ${fmt1(S.rise)}% from ${sl(S.first)} to ${sl(S.peak)}` + (S.peak !== S.last ? ` and then dropped in ${sl(S.last)}, so it is not a straight line and should be watched rather than projected forward.` : "."),
    `Home sides won ${fmt1(S.home)}% of matches and away sides ${fmt1(S.away)}%, a gap of ${fmt1(S.home-S.away)} percentage points. Home advantage is still real.`,
    `Possession and goals scored are only weakly linked (r = ${fmt2(S.rPossGoals)}), so possession on its own is a poor guide to attacking quality.`,
    `${displayName(w1[0])} (${signedTypo(w1[1])}) and ${displayName(w2[0])} (${signedTypo(w2[1])}) have the largest negative xG differentials, meaning they regularly scored less than the quality of their chances suggested.`,
    `Matches where one side scored or conceded nine or more goals make up only ${fmt2(S.highShare)}% of the data, so a single blowout says little about form.`,
    S.late >= S.early
      ? `Clubs earned slightly more points per match late in the season (${fmt2(S.late)}) than early on (${fmt2(S.early)}), which suggests squads hold their form rather than fading.`
      : `Clubs earned slightly fewer points per match late in the season (${fmt2(S.late)}) than early on (${fmt2(S.early)}), which suggests squads tire as the season goes on.`,
  ];
  const il = d3.select("#insightList").html("");
  insights.forEach((t,i)=>{ const li = il.append("li").attr("class","insight-item"); li.append("div").attr("class","insight-num").attr("aria-hidden","true").text(i+1); li.append("p").text(t); });

  const recos = [
    ["target", `Clubs with strongly negative xG differentials, such as ${displayName(w1[0])} and ${displayName(w2[0])}, should put more training time into finishing. They create the chances but do not convert them.`],
    ["chart", "Analysts should stop treating possession as a measure of control on its own. Pair it with shots on target and xG differential, because possession alone says little about goals."],
    ["balance", `Coaching staff should treat a single match with nine or more goals as an outlier, not a sign of form. Such matches are only ${fmt2(S.highShare)}% of all fixtures.`],
  ];
  const rl = d3.select("#recoList").html("");
  recos.forEach(([icon,t])=>{
    const r = rl.append("div").attr("class","reco-item");
    r.append("img").attr("class","reco-icon").attr("src",`img/${icon}.svg`).attr("alt","").attr("width",28).attr("height",28);
    r.append("p").text(t);
  });
}

