export const REVEAL_STATUSES = ["interview", "offer", "hired"] as const;

export function isIdentityRevealed(status: string): boolean {
  return (REVEAL_STATUSES as readonly string[]).includes(status);
}

export function aliasName(color: string | null, animal: string | null): string {
  return color && animal ? `${color} ${animal}` : "Anonymous applicant";
}

type Maskable = {
  applicant_name: string;
  email: string;
  status: string;
  alias_color: string | null;
  alias_animal: string | null;
};

/** Hide name/email unless the viewer is HR, blind review is off, or the applicant reached interview. */
export function maskApplicant<T extends Maskable>(
  app: T,
  opts: { isHr: boolean; blindReview: boolean },
): T & { masked: boolean } {
  if (opts.isHr || !opts.blindReview || isIdentityRevealed(app.status)) {
    return { ...app, masked: false };
  }
  return { ...app, applicant_name: aliasName(app.alias_color, app.alias_animal), email: "Hidden until interview", masked: true };
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
