import { createHash } from "crypto";
export function hashScimToken(t: string) { return createHash("sha256").update(t).digest("hex"); }
