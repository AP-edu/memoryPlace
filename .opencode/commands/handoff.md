---
description: End-of-session PC swap — push, state summary, PC checklist
agent: build
---

End the session with a PC handoff. Do all of these, in order:

1. `git status -sb` and `git log --oneline -5`. If there is uncommitted work, report it and STOP — do not commit unless explicitly asked.
2. If the branch is ahead of its remote, push it (`git push`) so the PC can pull. If the push fails, report why and stop.
3. Run `/check` (tsc + lint + vitest) and record the result.
4. Write the handoff summary to the user with exactly these headings:
   - **Branch / commits:** what to pull on the PC.
   - **Done here:** what was implemented + `/check` result.
   - **Needs the PC:** `npm run build`, FPS + live-click check of any 3D scene, and the green verdict (per AGENTS.md, laptop sessions never close out 3D work as green).
   - **Reminder:** swap to the PC now.
