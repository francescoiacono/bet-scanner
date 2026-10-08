import type { FixtureMarket, OddsSnapshot, Outcome } from "../types";
import { decimalOdds, instant, text } from "../validation";
import { array, footballSport, integer, object, type SportInfo, type VenueInfo } from "./oddsrelay-contract";

/** No fuzzy joins: one provider event, exact catalogue competition and exact outcome names. */
export function normalizeOddsRelay(value: unknown, venues: readonly VenueInfo[], sports: readonly SportInfo[], requestedBookmakers: readonly string[], now: number): OddsSnapshot {
  const root = object(value), meta = object(root.meta), data = array(root.data);
  if (meta.feed_type !== "standard" || meta.region !== "uk" || meta.version !== "v2" || meta.odds_format !== "decimal" || meta.next_cursor !== null || integer(meta.count) !== data.length) throw new RangeError("Unsupported or inconsistent OddsRelay board metadata.");
  instant(meta.processed_at);
  const processedAt = meta.processed_at as string;
  if (instant(processedAt) > now) throw new RangeError("Future provider snapshot timestamp.");
  const snapshot: OddsSnapshot = { provider: "ODDSRELAY", mode: "LIVE", receivedAt: new Date(now).toISOString(), processedAt, markets: [], excluded: [] };
  const catalogue = new Map(venues.map((v) => [v.id, v])), competitions = new Map(sports.filter(footballSport).map((s) => [s.key, s]));
  const ids = new Set<string>();
  const seen = meta.last_seen === undefined ? {} : object(meta.last_seen);
  for (let e = 0; e < data.length; e++) {
    let eventId: string | null = null;
    const pointer = `/data/${e}`;
    try {
      const event = object(data[e]); eventId = text(event.event_id, "event ID");
      if (ids.has(eventId)) throw new RangeError("Duplicate provider event; no fixture joining permitted");
      ids.add(eventId);
      const competitionId = text(event.sport_key, "competition ID"), competition = competitions.get(competitionId);
      if (!competition || event.sport_title !== competition.title) throw new RangeError("Unknown or ambiguous football competition");
      const home = text(event.home_team, "home team"), away = text(event.away_team, "away team");
      if (home === away || home === "Draw" || away === "Draw") throw new RangeError("Ambiguous team/outcome identity");
      instant(event.commence_time);
      const fixture = { id: eventId, sport: "FOOTBALL" as const, competitionId, competition: competition.title, homeTeam: home, awayTeam: away, kickoff: event.commence_time as string };
      const markets = array(event.markets), matchMarkets = markets.map((m, i) => ({ m: object(m), i })).filter(({ m }) => m.key === "h2h");
      if (matchMarkets.length !== 1) throw new RangeError("Missing or duplicate full-time h2h market");
      for (let i = 0; i < markets.length; i++) if (object(markets[i]).key !== "h2h") snapshot.excluded.push({ eventId, source: `${pointer}/markets/${i}`, reason: "Unsupported market; only standard football h2h is accepted" });
      const { m, i } = matchMarkets[0], marketPointer = `${pointer}/markets/${i}`;
      if (Object.keys(m).some((key) => key !== "key" && key !== "outcomes")) throw new RangeError("Unrecognized market metadata; full-time settlement cannot be verified");
      const market = { id: `${eventId}:h2h`, fixtureId: eventId, type: "MATCH_WINNER" as const, settlement: "REGULATION_TIME_1X2" as const, available: true };
      const row: FixtureMarket = { fixture, market, quotes: [] }, outcomes = array(m.outcomes), mapped = new Set<Outcome>();
      for (let o = 0; o < outcomes.length; o++) {
        const outcome = object(outcomes[o]), name = text(outcome.name, "outcome name");
        const selection: Outcome | null = name === home ? "HOME" : name === away ? "AWAY" : name === "Draw" ? "DRAW" : null;
        if (selection === null || mapped.has(selection) || outcome.point !== undefined) throw new RangeError("Unknown, duplicate or line-based outcome; market is ambiguous");
        mapped.add(selection);
        const offers = array(outcome.back);
        // lay is deliberately never mapped, irrespective of its price or liquidity.
        for (let b = 0; b < offers.length; b++) {
          const offerPointer = `${marketPointer}/outcomes/${o}/back/${b}`;
          try {
            const offer = object(offers[b]), bookmaker = catalogue.get(text(offer.bookmaker, "back bookmaker"));
            if (Object.keys(offer).some((key) => !["bookmaker", "price", "link", "places", "place_fraction", "dutch_id"].includes(key))) throw new RangeError("Unrecognized offer metadata; availability or settlement cannot be verified");
            if (!bookmaker || bookmaker.isExchange || !bookmaker.regions.includes("uk") || !requestedBookmakers.includes(bookmaker.id)) throw new RangeError("Unverified, unrequested or exchange venue in back offers");
            const price = decimalOdds(offer.price);
            if (offer.places !== undefined || offer.place_fraction !== undefined || offer.dutch_id !== undefined) throw new RangeError("Offer has incompatible settlement terms");
            const venueTimes = seen[bookmaker.id] === undefined ? {} : object(seen[bookmaker.id]);
            // The official last_seen sport-key base for football is soccer, not the competition key.
            const evidence = venueTimes.soccer;
            const evidenceAt = typeof evidence === "string" ? evidence : null;
            row.quotes.push({ id: offerPointer, fixtureId: eventId, competitionId, marketId: market.id, settlement: market.settlement, outcome: selection,
              decimalOdds: price, bookmaker, side: "BACK", available: true, evidenceAt, snapshotAt: processedAt,
              source: { provider: "ODDSRELAY", eventId, marketKey: "h2h", outcomeName: name, pointer: offerPointer, link: typeof offer.link === "string" && /^https:\/\//.test(offer.link) ? offer.link : null } });
          } catch (error) { snapshot.excluded.push({ eventId, source: offerPointer, reason: error instanceof Error ? error.message : "Invalid back offer" }); }
        }
      }
      snapshot.markets.push(row);
    } catch (error) {
      // Conflicting duplicate IDs invalidate every copy rather than merging them.
      snapshot.markets = snapshot.markets.filter((r) => r.fixture.id !== eventId);
      snapshot.excluded.push({ eventId, source: pointer, reason: error instanceof Error ? error.message : "Invalid provider event" });
    }
  }
  return snapshot;
}
