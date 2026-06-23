The import path `@/assets/civicplexus-mark.png.asset.json` is already correct:

- The file exists at `src/assets/civicplexus-mark.png.asset.json`
- All four import sites (`__root.tsx`, `auth.tsx`, `index.tsx`, `app-shell.tsx`) reference that exact path
- The `@/` alias maps to `src/` (standard in this project)

The error is a stale Vite module-runner cache from the earlier rename (`noopolis-mark` → `civicplexus-mark`). Vite cached the missing-module resolution before the new file landed and hasn't re-resolved it.

## Fix

Restart the Vite dev server once so it re-scans `src/assets/` and picks up the renamed pointer file. No code changes needed.

If after the restart the same error reappears, the next step is to verify the `@/` alias in `vite.config.ts` and confirm the file isn't being filtered by a `.gitignore` or asset-include rule — but that's unlikely given the other `.asset.json` imports in the same folder work.
