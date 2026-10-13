/** Session-only, bounded snapshots. Never consumes simulation RNG or mutates results. */
export class RecentReports {
  constructor() { this.items = []; }
  record(result, formation, experiment = null) {
    const army = JSON.stringify([...formation.units].sort((a, b) => a.id - b.id));
    this.items.push({ result: structuredClone(result), army, seed: formation.seed, experiment });
    if (this.items.length > 2) this.items.shift();
  }
  compare() {
    if (this.items.length < 2) return null;
    const [previous, current] = this.items;
    return { sameArmy: previous.army === current.army, sameSeed: previous.seed === current.seed, previous, current };
  }
}
