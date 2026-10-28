import { describe, it, expect } from "vitest";
import { maskApplicant } from "./applicant-alias";

const base = { applicant_name: "Jane Doe", email: "jane@x.com", alias_color: "Cyan", alias_animal: "Cormorant" };

describe("blind applicant review", () => {
  it("reviewer sees alias before interview", () => {
    const r = maskApplicant({ ...base, status: "screening" }, { isHr: false, blindReview: true });
    expect(r.applicant_name).toBe("Cyan Cormorant");
    expect(r.email).not.toContain("jane");
  });
  it("reviewer sees real name at interview stage", () => {
    const r = maskApplicant({ ...base, status: "interview" }, { isHr: false, blindReview: true });
    expect(r.applicant_name).toBe("Jane Doe");
  });
  it("HR always sees real name", () => {
    const r = maskApplicant({ ...base, status: "new" }, { isHr: true, blindReview: true });
    expect(r.applicant_name).toBe("Jane Doe");
  });
  it("no masking when blind review is off for the job", () => {
    const r = maskApplicant({ ...base, status: "new" }, { isHr: false, blindReview: false });
    expect(r.applicant_name).toBe("Jane Doe");
  });
});
