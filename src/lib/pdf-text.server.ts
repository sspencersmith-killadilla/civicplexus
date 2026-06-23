// Worker-compatible PDF text extraction.
// `unpdf` ships a serverless build of pdfjs with no native deps,
// safe to run inside Cloudflare Workers / TanStack Start server runtime.
import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(
  bytes: Uint8Array | ArrayBuffer,
  opts: { maxChars?: number } = {},
): Promise<{ text: string; pages: number; truncated: boolean }> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const pdf = await getDocumentProxy(buf);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n\n") : text;
  const max = opts.maxChars ?? 50_000;
  const truncated = joined.length > max;
  return {
    text: truncated ? joined.slice(0, max) : joined,
    pages: totalPages,
    truncated,
  };
}