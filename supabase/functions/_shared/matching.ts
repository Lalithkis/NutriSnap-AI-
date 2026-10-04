/**
 * Match free-text food names (from the vision model or the user) to catalog entries.
 * Deterministic and dependency free so it can be unit-tested and run in Deno.
 */

export interface CatalogFood {
  id: string;
  name: string;
  alternate_names: string[];
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(a|an|the|of|with|plain|fresh|homemade|bowl|plate|piece|pieces|serving)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(ies)$/, "y")
    .replace(/([^s])s$/, "$1");
}

function tokens(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter(Boolean));
}

/** Score in [0,1]. 1 = exact (normalized) name or alias match. */
export function matchScore(query: string, food: CatalogFood): number {
  const q = normalizeName(query);
  if (!q) return 0;
  const names = [food.name, ...food.alternate_names];
  let best = 0;
  for (const n of names) {
    const nn = normalizeName(n);
    if (nn === q) return 1;
    const a = tokens(q), b = tokens(nn);
    const inter = [...a].filter((t) => b.has(t)).length;
    const union = new Set([...a, ...b]).size;
    let s = union ? inter / union : 0;
    if (nn.includes(q) || q.includes(nn)) s = Math.max(s, 0.75);
    best = Math.max(best, s);
  }
  return best;
}

export function rankMatches<T extends CatalogFood>(query: string, catalog: T[], minScore = 0.34, limit = 5): { food: T; score: number }[] {
  return catalog
    .map((food) => ({ food, score: matchScore(query, food) }))
    .filter((m) => m.score >= minScore)
    .sort((x, y) => y.score - x.score || x.food.name.localeCompare(y.food.name))
    .slice(0, limit);
}
