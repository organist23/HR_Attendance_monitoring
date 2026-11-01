---
name: e2e-testing
description: Use when a change to the HR Attendance System has to be proven end to end — feature-workflow step 8, "run the E2E", "test this for real", or any pass that drives the Electron HR app with Playwright and creates employees or punches in Convex. Covers isolating the pass in a throwaway Convex project, proving the isolation, and tearing down everything the pass created.
---

# End-to-end testing: HR Attendance System

> Used during `feature-workflow` step 8 (Real-world E2E). Driver: Playwright over
> Electron (`e2e/hr.spec.js`), per CLAUDE.md "Project facts".

**Never run a pass against the developer's dev deployment `woozy-nightingale-996`
or any production deployment.** Every pass gets its own throwaway Convex project,
its own admin account, and the `E2E-` employee-ID prefix. The dev deployment holds
the developer's own data and the shared `admin` login.

## Isolation — what keeps a pass off real data

| Thing | Pass uses | Never |
|---|---|---|
| Convex deployment | a new project `hr-e2e-<pass>` created for this pass | `woozy-nightingale-996`, anything `prod` |
| App build | `dist/hr` built while `.env.local` points at the test deployment | a build pointing at dev |
| Admin login | `e2e-admin` with a random password generated for this pass, stored only in `.env.e2e` | the developer's `admin` account |
| Test data | employees whose ID starts with `E2E-` | any other ID |
| Purge | `e2e:purge`, which runs only where `E2E_PURGE_ALLOWED=true` is set | setting that var anywhere except the test deployment, or briefly on dev for the one-off leftover cleanup |

## Setup

```bash
# 0. Save the dev config. Step 1 rewrites .env.local.
cp .env.local .env.local.dev-backup

# 1. A new Convex project for this pass
npx convex dev --once --configure new --team keiphil-guimba --project hr-e2e-<pass> --dev-deployment cloud

# Pin it. Empty, dev, or prod = unset, so every command below refuses to run.
TEST_DEPLOYMENT=$(grep '^CONVEX_DEPLOYMENT=' .env.local | cut -d= -f2 | cut -d' ' -f1 | sed 's/^dev://')
case "$TEST_DEPLOYMENT" in *woozy-nightingale-996*|*prod*|"") unset TEST_DEPLOYMENT ;; esac
echo "test deployment: ${TEST_DEPLOYMENT:?STOP - step 1 failed or still points at dev}"

# 2. Auth env (fresh keys, never copied from dev) + the purge gate
node scripts/e2e-auth-env.mjs "${TEST_DEPLOYMENT:?}"
npx convex env set --deployment "${TEST_DEPLOYMENT:?}" E2E_PURGE_ALLOWED true

# 3. Throwaway admin, random password, written to .env.e2e (git-ignored)
PASS=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")
npx convex run --deployment "${TEST_DEPLOYMENT:?}" admin:create "{\"username\":\"e2e-admin\",\"password\":\"$PASS\"}"
printf 'E2E_ADMIN_USER=e2e-admin\nE2E_ADMIN_PASS=%s\n' "$PASS" > .env.e2e

# 4. Build the renderer against the test deployment
npm run build
```

**Every command that writes names `--deployment "${TEST_DEPLOYMENT:?}"`.** If
`TEST_DEPLOYMENT` is unset, the shell refuses to run the command at all.

Step 1 needs the developer's Convex CLI login, which already exists from
`npx convex dev`. If the CLI asks to log in, stop and hand it back. Never log in
for the developer.

## Prove the isolation before creating anything

1. **The build points at the test deployment:**
   `grep -l "$TEST_DEPLOYMENT" dist/hr/assets/*.js` lists a file, and
   `grep -l woozy-nightingale-996 dist/hr/assets/*.js` lists nothing.
2. **The test deployment is fresh:** it has exactly one user, `e2e-admin`.
   Check with `npx convex data users --deployment "${TEST_DEPLOYMENT:?}"`.
3. **You are testing the code you think you are:**
   `npx convex run --deployment "${TEST_DEPLOYMENT:?}" admin:isAdmin '{}'` returns `false`.
   That proves the function exists and an anonymous caller is not an admin.
4. **The purge gate is armed only here:**
   `npx convex env list --deployment "${TEST_DEPLOYMENT:?}"` shows `E2E_PURGE_ALLOWED`.

If any check fails, stop and report it. Do not run the suite.

## During the pass

- Run `npm run e2e`, and read every failure. A failure from a hung teardown or a
  timeout is still a failure, and the run must exit 0.
- **Hand-derive expected values before the run.** Times come from the server, so
  assert the status text ("Timed in", "Timed out"), not a computed hour.
- **Workday-only tests skip on Saturday and Sunday (Manila).** Record them as
  SKIPPED, never as PASS, and say they still need a weekday run.
- New test employees must use an ID that starts with `E2E-`. Anything else
  survives teardown.
- If rows you did not create appear in the test deployment, stop and report it.

## Teardown

```bash
# 1. Purge everything the pass created (employees, punches, auth accounts, sessions)
npx convex run --deployment "${TEST_DEPLOYMENT:?}" e2e:purge '{"prefix":"E2E-"}'

# 2. Restore the dev config and rebuild against dev
mv .env.local.dev-backup .env.local
rm -f .env.e2e
npm run build
grep -l woozy-nightingale-996 dist/hr/assets/*.js   # must list a file
```

3. **Delete the Convex project `hr-e2e-<pass>`.** The developer does this in the
   Convex dashboard (Project settings, then Delete project). Ask them to, and record it.
4. Record the pass in `PHASE-<N>-TEST-RESULTS.md`: date, test deployment name,
   pass/fail/skip per story and per assertion, the purge counts, and anything left behind.

## One-off: cleaning old E2E rows from dev

This applies only to the rows earlier passes left on `woozy-nightingale-996`
before this skill existed. The developer approved this cleanup once (2026-11-01).

```bash
npx convex env set --deployment woozy-nightingale-996 E2E_PURGE_ALLOWED true
npx convex run --deployment woozy-nightingale-996 e2e:purge '{"prefix":"E2E-"}'
npx convex env remove --deployment woozy-nightingale-996 E2E_PURGE_ALLOWED
npx convex env list --deployment woozy-nightingale-996   # E2E_PURGE_ALLOWED must be gone
```

## Common mistakes

| Symptom | Cause |
|---|---|
| Setup prints `STOP` or `parameter null or not set` | step 1 failed, or `.env.local` still points at dev. Fix that before anything else |
| Test employees show up in the developer's dev app | `dist/hr` was built before step 1, so it points at dev. Rebuild and re-check isolation step 1 |
| `e2e:purge` says "E2E purge disabled on this deployment" | the gate var is not set there. That is correct for dev and prod |
| Electron "Process failed to launch!" / "bad option" | the VS Code terminal sets `ELECTRON_RUN_AS_NODE=1`. The spec strips it, so do not remove that line |
| Suite exits 1 with no failed test ("worker teardown timeout") | the Electron app did not exit. The spec's `afterEach` exits it with `app.exit(0)`, so keep that |
| New employee missing from the list | more than 25 employees sort before it. The helper searches by ID, so use it |
| Dev app logs in to the wrong data after the pass | teardown step 2 was skipped, so `.env.local` and `dist` still point at the test project |
