---
name: review-panel
description: Run the PDFkaro review agents over a change. Use after an OpenSpec proposal is written and before code starts, and again before any pull request is opened or updated. Also use when asked to "run the panel", "review this change" or "review this PR" with the project's agents.
argument-hint: "[proposal|pr] [change-name or PR number]"
---

# Review panel

Seven agents are defined in `.claude/agents/`. This skill says which of them read a change, when, and what to do with what they say. The main session runs the panel; agents cannot start other agents.

## Stage 1: proposal review

Run this after `/opsx:propose` has written `openspec/changes/<name>/` and before `/opsx:apply`.

1. Run `openspec validate <name> --strict`. Fix what it reports first.
2. Start these agents in parallel, each with the change name and the path to its folder:

   | Agent | Runs when |
   | --- | --- |
   | `program-manager` | Always |
   | `software-architect` | Always |
   | `ux-designer` | The change adds or alters a page, a component, a style or page text |
   | `security-reviewer` | The change parses files in a new way, adds a dependency, touches headers or CSP, or touches the server |
   | `privacy-reviewer` | The change adds a network request, storage, logging, analytics or a server tool |

3. Update the change artifacts to settle every finding. Run the agents that raised findings again until each approves.
4. If any agent says **Blocked on the owner**, stop. Give the owner the question and wait. Do not start code.

## Stage 2: pull request review

Run this when the tasks are done and before a pull request is opened, and again after any later push that changes more than a review fix.

1. Run the checks listed under "Commands" in `CLAUDE.md` and `openspec validate --all --strict`. All must pass before the panel runs.
2. Start these agents in parallel, each with the change name, the base branch and the instruction to review `git diff <base>...HEAD`:

   | Agent | Runs when |
   | --- | --- |
   | `code-reviewer` | Always |
   | `security-reviewer` | Always |
   | `privacy-reviewer` | Always |
   | `software-architect` | Always |
   | `program-manager` | Always |
   | `ux-designer` | The diff touches `src/pages/`, `src/components/`, `src/content/`, `src/styles/` or the registry |

   To review a pull request that already exists, give each agent the pull request number and have it read the diff from there.

3. Collect the reports. Hand every **must fix**, every security or privacy finding and every **Changes needed** to the `developer` agent, or fix them in the main session. If a fix would go beyond `tasks.md`, update the change first.
4. Run again only the agents that raised findings, until each approves. Three rounds without agreement means the question goes to the owner.
5. Put a "Review panel" section in the pull request description:

   ```
   ## Review panel

   | Agent | Verdict | Notes |
   | --- | --- | --- |
   | program-manager | Approve | |
   | software-architect | Approve | Page weight 61 KB |
   | ux-designer | Approve | Screenshots below |
   | security-reviewer | Approve | |
   | privacy-reviewer | Approve | No-upload test read and run |
   | code-reviewer | Approve | 2 suggestions left open, listed below |

   OpenSpec change: openspec/changes/<name>/
   ```

   Report verdicts as the agents gave them. Do not write **Approve** for an agent that did not run or did not approve; write "Not run" and why.

## Rules

- The panel advises; `SPEC.md` decides. If two agents disagree, the one citing `SPEC.md` wins. If both do, or neither does, ask the owner.
- An agent's approval never settles an item under "Open decisions" in `SPEC.md`.
- Do not open a pull request with an open **must fix**, a failing test or a skipped test.
