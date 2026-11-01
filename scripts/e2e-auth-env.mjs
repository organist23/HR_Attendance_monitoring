// Sets fresh Convex Auth env vars (JWT_PRIVATE_KEY, JWKS, SITE_URL) on one deployment.
// Usage: node scripts/e2e-auth-env.mjs <deployment-name>   (see .claude/skills/e2e-testing)
// Keys are generated here and never printed.
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
import { spawnSync } from "node:child_process";

const deployment = process.argv[2];
if (!deployment || /woozy-nightingale-996|prod/.test(deployment)) {
  console.error("STOP: pass a throwaway test deployment name (not dev, not prod)");
  process.exit(1);
}

const keys = await generateKeyPair("RS256", { extractable: true });
const vars = {
  JWT_PRIVATE_KEY: (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " "),
  JWKS: JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(keys.publicKey)) }] }),
  SITE_URL: "http://localhost:5173",
};

for (const [name, value] of Object.entries(vars)) {
  // Call the local CLI through node: `npx` can't be spawned directly on Windows.
  const r = spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", "env", "set", "--deployment", deployment, name, "--", value],
    { stdio: ["ignore", "ignore", "pipe"], timeout: 60_000 },
  );
  if (r.status !== 0) {
    console.error(`${name} FAILED: ${String(r.stderr).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`${name} set`);
}
