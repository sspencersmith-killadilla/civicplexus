/**
 * Regression: extracting action items from 1-on-1 supervisor free-form notes.
 *
 * The extractor previously read only from `one_on_one_agenda_notes` and would
 * throw "No notes to scan" (or silently insert nothing) whenever a supervisor
 * had only added free-form notes on `one_on_one_notes`. These tests lock in
 * the multi-source read + insert path end-to-end (validator → handler → AI →
 * insert) so it can't regress silently again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Module mocks ---------------------------------------------------------

vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { __mock: "auth" },
}));

vi.mock("@tanstack/react-start", () => {
  // Minimal createServerFn shim: preserves validator + handler, ignores middleware.
  function createServerFn(_opts: unknown) {
    const state: { validator?: (i: unknown) => unknown; handler?: Function } = {};
    const builder: any = {
      middleware: (_m: unknown) => builder,
      inputValidator: (v: (i: unknown) => unknown) => { state.validator = v; return builder; },
      handler: (h: Function) => {
        const invoke = async (args: { data: unknown; context: unknown }) => {
          const data = state.validator ? state.validator(args.data) : args.data;
          return h({ data, context: args.context });
        };
        return invoke;
      },
    };
    return builder;
  }
  return { createServerFn };
});

const generateTextMock = vi.fn();
vi.mock("ai", () => ({ generateText: (...a: unknown[]) => generateTextMock(...a) }));

vi.mock("@/lib/ai-gateway.server", () => ({
  createLovableAiGatewayProvider: () => (_model: string) => ({ __model: _model }),
}));

process.env.LOVABLE_API_KEY = "test-key";

// Import AFTER mocks so createServerFn shim wins.
const { extractOneOnOneActionItems } = await import("@/lib/coaching-ai.functions");

// ---- Fake supabase --------------------------------------------------------

type Table =
  | "one_on_one_agenda_notes"
  | "one_on_one_notes"
  | "one_on_ones"
  | "one_on_one_action_items";

interface FakeState {
  agenda: Array<{ agenda_index: number; agenda_prompt: string | null; content: string }>;
  notes: Array<{ content: string; visibility: string | null }>;
  session: { title: string | null; summary: string | null; ai_summary: string | null } | null;
  inserted: Array<Record<string, unknown>>;
  insertError?: { message: string } | null;
}

function makeSupabase(state: FakeState) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = (table: Table) => {
    if (table === "one_on_one_action_items") {
      return {
        insert: (rows: Record<string, unknown>[]) => {
          if (state.insertError) return Promise.resolve({ error: state.insertError });
          state.inserted.push(...rows);
          return Promise.resolve({ error: null });
        },
      };
    }
    // Build a chainable query stub that ends when awaited or .maybeSingle() called.
    const rows: unknown[] =
      table === "one_on_one_agenda_notes" ? [...state.agenda] :
      table === "one_on_one_notes"        ? [...state.notes] :
      state.session ? [state.session] : [];
    const filters: Array<(r: any) => boolean> = [];
    const q: any = {
      select: () => q,
      order: () => q,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r?.[col] === val);
        return q;
      },
      maybeSingle: () => {
        const filtered = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: filtered[0] ?? null, error: null });
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        const filtered = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
      },
    };
    return q;
  };
  return { from, rpc };
}

const SESSION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID    = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function baseState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    agenda: [],
    notes: [],
    session: { title: "Weekly 1:1", summary: null, ai_summary: null },
    inserted: [],
    insertError: null,
    ...overrides,
  };
}

beforeEach(() => { generateTextMock.mockReset(); });

// ---- Tests ----------------------------------------------------------------

describe("extractOneOnOneActionItems — supervisor notes regression", () => {
  it("reads free-form supervisor notes (no agenda notes) and inserts extracted action items", async () => {
    const state = baseState({
      notes: [
        { content: "Alice will draft the Q3 roadmap by Friday. Bob to schedule stakeholder review.", visibility: "shared" },
      ],
    });
    const supabase = makeSupabase(state);

    generateTextMock.mockResolvedValueOnce({
      text: `[{"text":"Draft Q3 roadmap","due_date":"2026-08-01","assignee":"employee"},{"text":"Schedule stakeholder review","due_date":null,"assignee":"manager"}]`,
    });

    const res = await extractOneOnOneActionItems({
      data: { session_id: SESSION_ID },
      context: { supabase, userId: USER_ID },
    } as never);

    // The regression: supervisor notes MUST be included in the AI prompt.
    const promptArg = (generateTextMock.mock.calls[0][0] as { prompt: string }).prompt;
    expect(promptArg).toContain("SUPERVISOR / SHARED NOTES:");
    expect(promptArg).toContain("Alice will draft the Q3 roadmap");

    expect(res.inserted).toBe(2);
    expect(state.inserted).toHaveLength(2);
    expect(state.inserted[0]).toMatchObject({
      session_id: SESSION_ID,
      text: "Draft Q3 roadmap",
      due_date: "2026-08-01",
      assignee_label: "employee",
      created_by: USER_ID,
    });
    expect(state.inserted[1]).toMatchObject({
      text: "Schedule stakeholder review",
      due_date: null,
      assignee_label: "manager",
    });
  });

  it("throws a clear error when there are no notes at all", async () => {
    const supabase = makeSupabase(baseState());
    await expect(
      extractOneOnOneActionItems({
        data: { session_id: SESSION_ID },
        context: { supabase, userId: USER_ID },
      } as never),
    ).rejects.toThrow(/No notes to scan/i);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("returns inserted:0 (does not throw) when AI produces no parseable array", async () => {
    const state = baseState({ notes: [{ content: "Some chat", visibility: "shared" }] });
    const supabase = makeSupabase(state);
    generateTextMock.mockResolvedValueOnce({ text: "no action items detected" });

    const res = await extractOneOnOneActionItems({
      data: { session_id: SESSION_ID },
      context: { supabase, userId: USER_ID },
    } as never);
    expect(res).toEqual({ inserted: 0, items: [] });
    expect(state.inserted).toHaveLength(0);
  });

  it("drops malformed due_date and unknown assignee values instead of failing insert", async () => {
    const state = baseState({ notes: [{ content: "Follow up on budget", visibility: "shared" }] });
    const supabase = makeSupabase(state);
    generateTextMock.mockResolvedValueOnce({
      text: `[{"text":"Follow up on budget","due_date":"next friday","assignee":"ceo"}]`,
    });

    const res = await extractOneOnOneActionItems({
      data: { session_id: SESSION_ID },
      context: { supabase, userId: USER_ID },
    } as never);

    expect(res.inserted).toBe(1);
    expect(state.inserted[0]).toMatchObject({
      text: "Follow up on budget",
      due_date: null,
      assignee_label: null,
    });
  });

  it("combines agenda notes, supervisor notes, and summary in the prompt when all are present", async () => {
    const state = baseState({
      agenda: [{ agenda_index: 0, agenda_prompt: "Wins this week?", content: "Shipped payroll export." }],
      notes: [{ content: "Manager will pair with Alice on the KPI dashboard.", visibility: "shared" }],
      session: { title: "1:1", summary: "Strong week overall.", ai_summary: null },
    });
    const supabase = makeSupabase(state);
    generateTextMock.mockResolvedValueOnce({ text: "[]" });

    await extractOneOnOneActionItems({
      data: { session_id: SESSION_ID },
      context: { supabase, userId: USER_ID },
    } as never);

    const prompt = (generateTextMock.mock.calls[0][0] as { prompt: string }).prompt;
    expect(prompt).toContain("AGENDA NOTES:");
    expect(prompt).toContain("Shipped payroll export.");
    expect(prompt).toContain("SUPERVISOR / SHARED NOTES:");
    expect(prompt).toContain("pair with Alice");
    expect(prompt).toContain("SUMMARY:");
    expect(prompt).toContain("Strong week overall.");
  });
});
