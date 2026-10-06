/** Explicit source-label alternatives, selected by the canonical season team
 * set only. No suffix heuristics, fuzzy matching, results, prices or forecasts.
 */
export const PRICE_TEAM_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  Arsenal: ["Arsenal", "Arsenal FC"], "Aston Villa": ["Aston Villa", "Aston Villa FC"],
  Bournemouth: ["AFC Bournemouth", "Bournemouth"], Brentford: ["Brentford", "Brentford FC"],
  Brighton: ["Brighton & Hove Albion", "Brighton & Hove Albion FC"], Burnley: ["Burnley", "Burnley FC"],
  Cardiff: ["Cardiff City"], Chelsea: ["Chelsea FC"], "Crystal Palace": ["Crystal Palace", "Crystal Palace FC"],
  Everton: ["Everton", "Everton FC"], Fulham: ["Fulham", "Fulham FC"], Huddersfield: ["Huddersfield Town"],
  Hull: ["Hull City"], Ipswich: ["Ipswich Town FC"], Leeds: ["Leeds United", "Leeds United FC"],
  Leicester: ["Leicester City", "Leicester City FC"], Liverpool: ["Liverpool", "Liverpool FC"],
  Luton: ["Luton Town FC"], "Man City": ["Manchester City", "Manchester City FC"],
  "Man United": ["Manchester United", "Manchester United FC"], Middlesbrough: ["Middlesbrough FC"],
  Newcastle: ["Newcastle United", "Newcastle United FC"], Norwich: ["Norwich City", "Norwich City FC"],
  "Nott'm Forest": ["Nottingham Forest", "Nottingham Forest FC"], QPR: ["Queens Park Rangers"],
  "Sheffield United": ["Sheffield United FC"], Southampton: ["Southampton FC"], Stoke: ["Stoke City"],
  Sunderland: ["Sunderland", "Sunderland AFC"], Swansea: ["Swansea City"],
  Tottenham: ["Tottenham Hotspur", "Tottenham Hotspur FC"], Watford: ["Watford FC"],
  "West Brom": ["West Bromwich Albion"], "West Ham": ["West Ham United", "West Ham United FC"],
  Wolves: ["Wolverhampton Wanderers", "Wolverhampton Wanderers FC"],
});
export function normalizePriceTeam(team: string): string {
  const value = team.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!value) throw new RangeError("Price fixture teams must not be blank.");
  return value;
}
export function resolvePriceTeam(sourceTeam: string, canonicalTeams: ReadonlySet<string>, aliases = PRICE_TEAM_ALIASES): string {
  const team = normalizePriceTeam(sourceTeam);
  if (!Object.hasOwn(aliases, team)) throw new RangeError(`Unknown Football-Data team alias: ${team}.`);
  const candidates = aliases[team].filter((canonical) => canonicalTeams.has(canonical));
  if (candidates.length !== 1) throw new RangeError(`Unmatched or ambiguous alias ${team}: ${candidates.length} canonical season candidates.`);
  return candidates[0];
}
