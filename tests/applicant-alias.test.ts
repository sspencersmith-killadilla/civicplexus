import { describe, it, expect } from "vitest";
import { maskApplicant, maskBoardApplication, redactText } from "../src/lib/applicant-alias";

const base = { applicant_name: "Jane Doe", email: "jane@x.com", alias_color: "Cyan", alias_animal: "Cormorant" };

describe("blind applicant review", () => {
  it("reviewer sees alias before interview", () => {
    const r = maskApplicant({ ...base, status: "screening" }, { blindReview: true });
    expect(r.applicant_name).toBe("Cyan Cormorant");
    expect(r.email).not.toContain("jane");
  });
  it("real name shows at interview stage", () => {
    expect(maskApplicant({ ...base, status: "interview" }, { blindReview: true }).applicant_name).toBe("Jane Doe");
  });
  it("HR is masked too until they use Show identity", () => {
    expect(maskApplicant({ ...base, status: "new" }, { blindReview: true }).masked).toBe(true);
  });
  it("no masking when blind review is off for the job", () => {
    expect(maskApplicant({ ...base, status: "new" }, { blindReview: false }).applicant_name).toBe("Jane Doe");
  });
});

describe("resume / cover letter redaction", () => {
  it("removes name, email, phone, year and pronouns", () => {
    const out = redactText("Jane Doe, jane@x.com, (512) 555-1234. She graduated in 2004.", ["Jane Doe"]);
    expect(out).not.toMatch(/Jane|Doe|jane@x\.com|555-1234|2004|\bShe\b/);
    expect(out).toContain("they graduated");
  });
});

describe("board application blind review", () => {
  const app = {
    first_name: "Sam", last_name: "Lee", email: "s@x.com", phone: "555", address: "1 Main St", city: "Austin",
    state: "TX", postal_code: "78701", employer: "Acme", alias_color: "Teal", alias_animal: "Otter",
    statement: "Sam Lee has served Acme since 2010.",
  };
  it("hidden while submitted", () => {
    const r = maskBoardApplication({ ...app, status: "submitted" });
    expect(`${r.first_name} ${r.last_name}`).toBe("Teal Otter");
    expect(r.address).toBeNull();
    expect(r.statement).not.toMatch(/Sam|Lee|Acme|2010/);
  });
  it("revealed once shortlisted", () => {
    expect(maskBoardApplication({ ...app, status: "shortlisted" }).first_name).toBe("Sam");
  });
});
