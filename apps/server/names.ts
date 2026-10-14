/** Traveller names: one canonical form, one alphabet, no impersonation, no duplicates. */
export type NameProblem = "empty" | "mixed-script" | "reserved";

export const NAME_MESSAGES: Record<NameProblem | "taken", string> = {
  empty: "Choose a name for your traveller.",
  "mixed-script": "Use letters from a single alphabet in your name.",
  reserved: "That name belongs to someone in Highcross. Choose another.",
  taken: "Another traveller already uses that name. Choose another.",
};

const STAFF = [
  "admin",
  "administrator",
  "moderator",
  "mod",
  "gm",
  "game master",
  "system",
  "server",
  "host",
  "staff",
  "developer",
  "threefold",
  "guard",
  "watch",
];
const NPCS = [
  "mara",
  "nemi",
  "concord watch",
  "briar hound",
  "keeper of hours",
  "provisioner",
  "elian voss",
];

// Cyrillic and Greek letters that render like Latin ones, and digits that
// stand in for letters. Not the full Unicode confusables table: together with
// the single-alphabet rule it is enough for a small invited group.
const LOOKALIKES: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
  і: "i",
  ј: "j",
  ѕ: "s",
  α: "a",
  β: "b",
  ε: "e",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
};

/** NFKC, letters, digits, spaces, apostrophes and hyphens only, at most 20 characters. */
export function cleanName(raw: unknown): string {
  const text = (typeof raw === "string" ? raw : "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} '-]/gu, "")
    .replace(/ +/g, " ")
    .trim();
  return Array.from(text).slice(0, 20).join("").trim();
}

/** The skeleton every comparison uses: case, accents, look-alikes and separators removed. */
export function nameKey(name: string): string {
  return Array.from(
    name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase(),
    (c) => LOOKALIKES[c] ?? c,
  )
    .join("")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/[\s'-]/g, "");
}

const words = (name: string) =>
  name
    .split(/[\s'-]+/)
    .map(nameKey)
    .filter(Boolean);

function script(letter: string): string {
  if (/\p{Script=Latin}/u.test(letter)) return "latin";
  if (/\p{Script=Cyrillic}/u.test(letter)) return "cyrillic";
  if (/\p{Script=Greek}/u.test(letter)) return "greek";
  return "other";
}

/** Whether `name` contains `phrase` as a run of whole words. */
function containsWords(name: string[], phrase: string[]): boolean {
  for (let i = 0; i + phrase.length <= name.length; i++)
    if (phrase.every((w, j) => name[i + j] === w)) return true;
  return false;
}

export class Names {
  private staff: Set<string>;
  private npcs: string[][];
  private index = new Map<string, Set<string>>();
  /** `extra` reserves the names of characters the world already defines. */
  constructor(extra: Iterable<string> = []) {
    this.staff = new Set(STAFF.map(nameKey));
    this.npcs = [...NPCS, ...[...extra].flatMap((n) => n.split("·"))]
      .map(words)
      .filter((w) => w.length);
  }
  problem(name: string): NameProblem | null {
    if (!name) return "empty";
    const scripts = new Set(
      Array.from(name.match(/\p{L}/gu) ?? [], (letter) => script(letter)),
    );
    if (scripts.size > 1) return "mixed-script";
    const key = nameKey(name),
      parts = words(name);
    if (
      this.staff.has(key) ||
      this.npcs.some((npc) => npc.join("") === key || containsWords(parts, npc))
    )
      return "reserved";
    return null;
  }
  /** Whether a different character already uses a name with the same skeleton. */
  taken(name: string, exceptId?: string): boolean {
    for (const id of this.index.get(nameKey(name)) ?? [])
      if (id !== exceptId) return true;
    return false;
  }
  add(id: string, name: string) {
    const key = nameKey(name);
    const ids = this.index.get(key) ?? new Set<string>();
    ids.add(id);
    this.index.set(key, ids);
  }
}
