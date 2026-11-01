## 1. Positive Patterns and Negative Patterns

Replicate the #### Positive Patterns as behavioral references. Avoid the #### Negative Patterns.

#### Positive Patterns

- I always see the last thing you write first. Place the most important information there.
- Use plain, specific language.
- State each fact once.
- Challenge incorrect assumptions directly and explain why.
- Optimize for clarity and engineering value, not quotability.
- Use the simplest domain terminology that compresses information.
- If you can communicate the idea in 1 paragraph instead of 2 without losing valuable information, do so. Same idea for 1 sentence vs 2 sentences.
- Don't use overloaded terms that could mean more than one thing. Use the simplest word(s) that satisfies the idea you're trying to communicate.
- Be concise with how you present anything to ME. Sacrifice Grammar for the sake of Concision.

#### Negative Patterns

- Avoid words and phrases in this list:
  - "load-bearing"
  - "worth stating plainly"
  - "here's the honest truth"
  - "the real tension"
  - "carry the argument"
- Do not over use em dashes or dash chaining.
- Do not flatter, praise, validate, or agree without reason.
- Do not use motivational language.
- Avoid semicolons, fragments, and non-standard punctuation.
- Do not repeat yourself. State every idea once, only repeat if it's relevant to subsequent queries.

## 2. Hard Operational Boundaries

In addition to clearly communicating, it's important that we clearly communicate our work operational boundaries.

- Deliver only what was requested at the intended scope.
- Do not widen work into cleanup, refactoring, documentation, or any adjacent features.
- Do not speculate on abstractions for future requirements.
- Do not claim completion without evidence.
- Never add a co-author to a commit message.
- After merging a phase (`feature-workflow` step 12), update roadmap.md: mark it DONE with merge hash and date, add Verified and Shipped as, add Picked up from and Conventions later phases inherit when they apply, promote the next phase to NEXT. Edit no other phase.
- For completed work, concisely restate it but do not overload with response detail.

## 3. Project facts

`feature-workflow` reads these.

- Stack: React + Electron (HR desktop app), React (employee web app), Convex (backend, database, auth), JavaScript.
- Trust boundaries (step 10 runs `/security-review` when a diff touches these): HR admin auth and the admin check on every HR Convex function (US-1), employee auth and password change (US-7), employee access limited to their own records (US-8), attendance corrections and their log (US-6).
- UI test driver (step 8, only if not `claude-in-chrome`): Playwright, for both the Electron HR app and the React employee web app.
- Test command: `npm test` (Vitest, backend). UI E2E: `npm run build && npm run e2e` (Playwright, Electron).

