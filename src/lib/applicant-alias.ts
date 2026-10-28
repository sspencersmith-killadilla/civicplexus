export const REVEAL_STATUSES = ["interview", "offer", "hired"] as const;
/** Board/commission applications reveal once shortlisted. */
export const BOARD_REVEAL_STATUSES = ["shortlisted", "approved"] as const;

export function isIdentityRevealed(status: string): boolean {
  return (REVEAL_STATUSES as readonly string[]).includes(status);
}
export function isBoardIdentityRevealed(status: string): boolean {
  return (BOARD_REVEAL_STATUSES as readonly string[]).includes(status);
}

export function aliasName(color: string | null, animal: string | null): string {
  return color && animal ? `${color} ${animal}` : "Anonymous applicant";
}

export const HIDDEN = "Hidden until interview";

/**
 * Black out personal details in free text: emails, phones, URLs, street
 * addresses, dates and years, gendered pronouns, and any known name tokens.
 */
export function redactText(text: string | null | undefined, knownNames: Array<string | null | undefined> = []): string {
  if (!text) return "";
  let out = text;
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "█████");
  out = out.replace(/\bhttps?:\/\/\S+|\bwww\.\S+|\blinkedin\.com\/\S+/gi, "█████");
  out = out.replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "█████");
  out = out.replace(/\b\d{1,6}\s+(?:[A-Z][a-z]+\s){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place|Pkwy|Hwy)\b\.?/g, "█████");
  out = out.replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, "█████");
  out = out.replace(/\b(?:19|20)\d{2}\b/g, "████");
  out = out.replace(/\b(he|she)\b/gi, "they").replace(/\b(him|her)\b/gi, "them").replace(/\b(his|hers)\b/gi, "their");
  out = out.replace(/\b(Mr|Mrs|Ms|Miss)\.?\s/g, "");
  const tokens = knownNames
    .flatMap((n) => (n ?? "").split(/\s+/))
    .map((t) => t.replace(/[^\p{L}'-]/gu, ""))
    .filter((t) => t.length >= 2);
  for (const t of tokens) {
    out = out.replace(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "█████");
  }
  return out;
}

type Maskable = {
  applicant_name: string;
  email: string;
  status: string;
  alias_color: string | null;
  alias_animal: string | null;
};

/** Everyone (HR included) sees the alias until interview, unless blind review is off for the job. HR can reveal on demand. */
export function maskApplicant<T extends Maskable>(
  app: T,
  opts: { blindReview: boolean },
): T & { masked: boolean } {
  if (!opts.blindReview || isIdentityRevealed(app.status)) {
    return { ...app, masked: false };
  }
  return { ...app, applicant_name: aliasName(app.alias_color, app.alias_animal), email: HIDDEN, masked: true };
}

type BoardMaskable = {
  first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; state: string | null; postal_code: string | null;
  employer: string | null; status: string; alias_color: string | null; alias_animal: string | null;
  qualifications?: string | null; statement?: string | null; conflicts_disclosure?: string | null;
  cover_letter_path?: string | null; form_data?: unknown;
};

export function maskBoardApplication<T extends BoardMaskable>(app: T): T & { masked: boolean } {
  if (isBoardIdentityRevealed(app.status)) return { ...app, masked: false };
  const names = [app.first_name, app.last_name, app.employer];
  return {
    ...app,
    first_name: app.alias_color ?? "Anonymous",
    last_name: app.alias_animal ?? "applicant",
    email: HIDDEN, phone: null, address: null, city: null, state: null, postal_code: null, employer: null,
    qualifications: redactText(app.qualifications, names),
    statement: redactText(app.statement, names),
    conflicts_disclosure: redactText(app.conflicts_disclosure, names),
    form_data: {},
    masked: true,
  };
}

const SWATCH: Record<string, string> = {
  Cyan: "#06b6d4", Amber: "#f59e0b", Coral: "#fb7185", Indigo: "#6366f1", Jade: "#10b981", Crimson: "#dc2626",
  Teal: "#14b8a6", Saffron: "#eab308", Violet: "#8b5cf6", Olive: "#84843a", Scarlet: "#ef4444", Azure: "#3b82f6",
  Plum: "#9333ea", Ochre: "#ca8a04", Cobalt: "#1d4ed8", Rose: "#f43f5e", Lime: "#84cc16", Slate: "#64748b",
  Ruby: "#be123c", Mint: "#34d399", Copper: "#b45309", Sapphire: "#1e40af", Lilac: "#c084fc", Bronze: "#a16207",
  Emerald: "#059669", Tangerine: "#f97316", Magenta: "#d946ef", Pearl: "#a8a29e", Sienna: "#a0522d", Navy: "#1e3a8a",
};
export function aliasSwatch(color: string | null): string {
  return (color && SWATCH[color]) || "#64748b";
}
