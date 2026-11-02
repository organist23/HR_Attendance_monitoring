# Phase 5 — Production Backend and Web App on Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A push to `main` deploys prod Convex and the employee web app on `*.vercel.app` together.

**Architecture:** One committed `vercel.json` makes Vercel run `npx convex deploy --cmd "<web build>"`. The Convex CLI deploys to whatever deployment `CONVEX_DEPLOY_KEY` names and passes that deployment's URL to the Vite build as `VITE_CONVEX_URL`. The pipeline is proven first with a **dev** deploy key of a throwaway `hr-e2e-p5` project (the CLI accepts `dev:` keys, `convex/dist/esm/cli/lib/deployment.js` `isDeploymentKey`), running the web E2E against the live Vercel URL. Then the key is swapped for the prod key of `hr-attendance-system`.

**Tech Stack:** Existing only. Convex CLI, Vite, Playwright. Vercel Git integration (dashboard, no Vercel CLI). No new deps.

**Spec:** `spec.md` Part two, US-11, US-12. Roadmap: `roadmap.md`, Phase 5.

## Context

Facts checked on 2026-11-02:
- `npx convex deploy` infers `VITE_CONVEX_URL` because `vite` is a dependency.
- In a Vercel Preview build it refuses a prod deploy key (`isNonProdBuildEnvironment`). So branch previews can never deploy prod.
- No Vercel CLI is installed. Vercel setup is done by the developer in the dashboard. Secrets (deploy keys, admin password) are pasted by the developer into Vercel or their own terminal and never pass through the agent.
- `e2e/web.spec.js` reads `VITE_CONVEX_URL` from `.env.local` and `baseURL` is fixed to `http://localhost:4174` with a `vite preview` webServer.
- `admin:create` is an `internalAction`, so only the CLI can call it.

## Global Constraints

- Never run E2E against prod or `woozy-nightingale-996` (`e2e-testing` skill). Prod is checked only with steps that create no employees or punches.
- `E2E_PURGE_ALLOWED` is never set on prod.
- Prod `SITE_URL` is the Vercel production address, `https://<name>.vercel.app`.
- `CONVEX_DEPLOY_KEY` is set in Vercel for the **Production** environment only.
- `.env.local` stays pointed at dev after every task except while the `e2e-testing` setup has it pointed at the throwaway.

## Review Focus

- **Vercel install pulls Electron (~100 MB) and fails or times out.** `installCommand` sets `ELECTRON_SKIP_BINARY_DOWNLOAD=1` (Task 1). Checked by the first green Vercel build (Task 2).
- **The live bundle points at the wrong deployment.** Task 2 and Task 3 fetch the live JS and grep for the expected deployment name and the absence of `woozy-nightingale-996`.
- **A branch preview deploys to prod.** Key scoped to Production only, plus the CLI's own refusal. Task 3 checks the Vercel env scope.
- **Building the HR app against prod rewrites `.env.local`.** Task 3 builds with `VITE_CONVEX_URL` set in the shell, which Vite does not let `.env.local` override, then rebuilds dev and greps `dist`.
- **Playwright's `baseURL` override breaks the local run.** Task 1 keeps the local default, and step 8's full local run covers it.

---

### Task 1: Repo changes for hosting

**Files:**
- Create: `vercel.json`
- Modify: `playwright.config.js` (web project `baseURL`, `webServer`)
- Modify: `scripts/e2e-auth-env.mjs` (add a `siteUrl` argument)

**Interfaces:**
- Produces: `node scripts/e2e-auth-env.mjs <deployment> [siteUrl]`, where `siteUrl` defaults to `http://localhost:5173`. The refusal of names matching `woozy-nightingale-996` or `prod` is unchanged. Prod's generated name doesn't match it, so the script works on prod.
- Produces: env `E2E_BASE_URL`. When set, the `web` project uses it as `baseURL` and Playwright starts no `webServer`.

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "installCommand": "ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci",
  "buildCommand": "npx convex deploy --cmd \"npx vite build --config vite.web.config.js\"",
  "outputDirectory": "dist/web"
}
```

- [ ] **Step 2: `playwright.config.js`.** Set `baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4174"`, and set `webServer` to `undefined` when `E2E_BASE_URL` is set.

- [ ] **Step 3: `scripts/e2e-auth-env.mjs` takes `siteUrl` from `process.argv[3]`.** Use `?? "http://localhost:5173"`. Update the usage comment. The skill's setup call is unchanged.

- [ ] **Step 4: Verify the local web build and the guard**

Run: `npx vite build --config vite.web.config.js` → Expected: `dist/web/index.html` built.
Run: `node scripts/e2e-auth-env.mjs woozy-nightingale-996` → Expected: `STOP`, exit 1.
Run: `npx playwright test --list --project web` → Expected: lists the 10 web tests (config parses).

- [ ] **Step 5: Commit**

```bash
git add vercel.json playwright.config.js scripts/e2e-auth-env.mjs
git commit -m "build: vercel config, live baseURL for web e2e, auth env takes site url"
```

### Task 2: Prove the pipeline against a throwaway project

This is the step 8 pass for US-12, plus the US-11 reject on a missing key. The `e2e-testing` setup steps 0–3 run first with project `hr-e2e-p5`, and isolation checks 2–4 pass before the developer touches Vercel.

**Consumes:** Task 1's `vercel.json`, `e2e-auth-env.mjs` `siteUrl`, and `E2E_BASE_URL`.

- [ ] **Step 1 (developer, dashboard):** in Convex `hr-e2e-p5` → the dev deployment → Settings → generate a **development deploy key**. In Vercel, import `organist23/HR_Attendance_monitoring` and add `CONVEX_DEPLOY_KEY` = that key (Production only). Under Settings → Git, set the Production Branch to `phase-5-go-live`. Note: the import's first build from `main` has no `vercel.json` and gives a broken page that touches no Convex deployment. The next step replaces it.
- [ ] **Step 2: Push the branch.** Expected: the Vercel production build is green and the build log shows `Deployed Convex functions to https://<hr-e2e-p5 dev>.convex.cloud`.
- [ ] **Step 3: Point auth at the live URL.** `node scripts/e2e-auth-env.mjs "$TEST_DEPLOYMENT" https://<name>.vercel.app`.
- [ ] **Step 4: Bundle check.** `curl` the live `index.html`, then its `assets/*.js`. Expected: it contains the `hr-e2e-p5` deployment name and does not contain `woozy-nightingale-996`.
- [ ] **Step 5: Web E2E against the live site.** `E2E_BASE_URL=https://<name>.vercel.app npx playwright test --project web`. Expected: 10 pass, exit 0.
- [ ] **Step 6: Watch it fail.** Developer: Vercel → the deployment → Redeploy with `CONVEX_DEPLOY_KEY` replaced by `dev:bogus|x`. Expected: the build fails at `convex deploy`, and the live URL still serves the bundle from Step 4 (same asset hash). Then remove the key and redeploy. Expected: the build fails because no deployment was selected. Restore the real key.
- [ ] **Step 7: Teardown** per the `e2e-testing` skill: purge, restore `.env.local`, rebuild against dev, grep. The developer deletes `hr-e2e-p5`. Record everything in `PHASE-5-TEST-RESULTS.md`.

### Task 3: Prod cutover (after the step 11 merge)

US-11 and the prod half of US-12. Runs after `phase-5-go-live` is merged to `main`.

- [ ] **Step 1 (developer, dashboard):** in Convex `hr-attendance-system`, generate a **production deploy key**. In Vercel, replace `CONVEX_DEPLOY_KEY` (Production only) and set the Production Branch back to `main`.
- [ ] **Step 2: Push `main`.** Expected: a green Vercel build, and the log shows the prod deployment URL. Record `<prodName>`.
- [ ] **Step 3: Prod auth env.** `node scripts/e2e-auth-env.mjs <prodName> https://<name>.vercel.app`. Then `npx convex env list --deployment <prodName>` shows `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL`, and no `E2E_PURGE_ALLOWED`.
- [ ] **Step 4 (developer, own terminal, so the password never enters this transcript):** `npx convex run --deployment <prodName> admin:create '{"username":"<name>","password":"<pw>"}'`.
- [ ] **Step 5: Prod rejects (no data created).**
  - `npx convex run --deployment <prodName> e2e:purge '{"prefix":"E2E-"}'` → "E2E purge disabled on this deployment"
  - `e2e:seedPunch` with any args → same error
  - `admin:create` with a throwaway username → "Admin already exists"
  - `npx convex data users --deployment <prodName>` → exactly 1 row, the admin
- [ ] **Step 6: Live site and bundle.** `curl` the live JS. Expected: it contains `<prodName>` and not `woozy-nightingale-996`. In a browser, the URL shows the employee login.
- [ ] **Step 7: HR app against prod.** `VITE_CONVEX_URL=https://<prodName>.convex.cloud npx vite build`, then `npm run hr`. The developer logs in as the prod admin. Then `npm run build` and grep `dist/hr` for `woozy-nightingale-996`.
- [ ] **Step 8: Record** the prod checks in `PHASE-5-TEST-RESULTS.md`. Update the memory note about pushing to dev after merging: pushing `main` now also releases prod.

Not checked on prod, per the Global Constraints: the US-12 accept "an employee logs in and sees their DTR". It is covered by Task 2 Step 5 on the identical pipeline. The first real check comes after Phase 6 imports employees.
