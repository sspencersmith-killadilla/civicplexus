## Fix: undici vulnerabilities (transitive)

Both findings trace to `undici` pulled in transitively by `@tanstack/react-start` and `isomorphic-dompurify`. Neither package has a direct fix released yet, so the fix is a Bun overrides pin to a patched undici.

### Steps

1. Add a `resolutions`/`overrides` block to `package.json` pinning `undici` to `^6.21.2` (patches all three GHSAs: vmh5-mc38-953g, vxpw-j846-p89q, hm92-r4w5-c3mj).
2. Run `bun install` to regenerate the lockfile with the override applied.
3. Verify via `bun pm ls undici` that only the patched version resolves.
4. Mark the `vulnerable_dependencies_high` finding resolved via `manage_security_finding`.

### Notes

- Scope limited to the high-severity finding as requested; the medium finding is not touched.
- No application code changes; `undici` is only used server-side by the bundled runtime adapters.
