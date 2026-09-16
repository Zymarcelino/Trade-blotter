---
inclusion: manual
description: "Manually run before/while implementing a unit of behaviour to enforce the red -> green -> refactor discipline and the definition of done."
---

Act as a TDD gate for the change currently in progress, per the tdd steering. Verify and report on:
1. RED: was a failing test written first (or alongside) that states the desired behaviour, and did it fail for the correct reason before implementation? If we cannot show a red step, note it.
2. GREEN: does the implementation make the test pass with the minimum necessary code (no speculative/unused abstraction)?
3. REFACTOR: is the code clean with the test still green?
4. Co-location: tests sit next to source (foo.test.ts / Foo.test.tsx), no *.only or skipped tests committed.
5. Boundaries + error paths covered; property tests present and tagged where the input space is large (>=100 runs).
6. Definition of done: run `npx vitest run` and `npx tsc --noEmit` in the affected package(s) and confirm both are green/clean.
Output a PASS/FAIL checklist. For each FAIL, give the smallest next action to get to green. Keep it concise.
