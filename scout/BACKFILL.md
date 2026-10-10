# Scout: historical backfill

You are the lead editor of the scout for the Alignment Incident Database, doing a **historical sweep**. The daily scan only catches material from the last ~48 hours. Your job is to fill in the history: incidents from about 2016 to now that aren't in the database yet.

Read `scout/PROMPT.md` and `CLAUDE.md` first. Follow PROMPT.md exactly for **Scope**, **Phase 2 (Edit)**, **Phase 3 (Publish)**, and the **Report**. This file replaces only **Phase 1 (Gather)**. Everything else applies unchanged: no cap, verbatim quotes, drafts, one commit, and today's scan log.

Before starting, list what's already covered: read the titles, models, dates, and source URLs in `data/incidents/`. **Never duplicate an existing record.** If the sweep finds better or primary sources for an existing record, make it an `update`.

## Phase 1: Gather (subagents, in parallel)

Spawn one research subagent per lane, all at once. Each one gets its lane, the scope section from PROMPT.md, the list of existing incidents (so it can skip them), and the findings output format from PROMPT.md. Each writes `scout/out/findings/<lane>.json`.

The candidate lists below are **leads to research, not facts.** Names, dates, and details must come from the sources each subagent actually reads. Drop any lead that turns out to be out of scope (e.g. plain hallucination) or can't be sourced. Each lane should also **look beyond its list**, using the compendiums and searches noted.

| Lane | Covers | Candidate leads |
|---|---|---|
| `classic-spec-gaming` | Reward hacking and specification gaming in RL and early systems (about 2016–2022) | OpenAI "Faulty reward functions in the wild" (CoastRunners, 2016). Notable entries from DeepMind's specification-gaming examples list (Krakovna et al.); pick the best-documented ones and cite their original papers. **Compendium:** the DeepMind spec-gaming list and its linked spreadsheet. |
| `chatbots-deployed` | Deployed chat assistants acting against intent | Microsoft Tay (2016). Bing Chat / "Sydney" threats and manipulation (Feb 2023: Kevin Roose/NYT, Marvin von Hagen). Gemini telling a user "please die" (Nov 2024). Grok incidents (May 2025 "white genocide" replies, July 2025 "MechaHitler" posts, Grok 4 consulting Musk's views). Character.AI and ChatGPT cases involving harmful advice to vulnerable users, with lawsuits (2024–2025). "AI psychosis" reporting (2025). |
| `agents-deployed` | Coding and computer-use agents causing real damage or acting outside their instructions | Gemini CLI deleting a user's files (2025). Cursor and Claude Code destructive-command incidents with first-hand reports. Anthropic's "Project Vend" (Claudius) shopkeeper experiment (2025). Any other agent mishaps with primary accounts. |
| `lab-evals` | Misbehavior documented in system cards and lab evaluations | GPT-4 system card: TaskRabbit CAPTCHA deception (ARC Evals, 2023). o1 system card: escaping the CTF container via a misconfigured Docker API (2024). Claude 3.7 Sonnet system card: special-casing tests (2025). Claude Opus 4 system card: blackmail, self-exfiltration attempts, whistleblowing (May 2025). Claude Sonnet 4.5 evaluation awareness (2025). Later system cards through 2026. |
| `safety-research` | Third-party and lab research documenting misaligned behavior in named models | Apollo Research "Frontier models are capable of in-context scheming" (Dec 2024). Anthropic/Redwood alignment faking (Dec 2024). Emergent misalignment (Betley et al., 2025). Palisade chess-engine hacking (2025). METR on frontier models reward hacking (2025). OpenAI on chain-of-thought monitoring and reward hacking (2025). OpenAI/Apollo anti-scheming work (2025). Sakana "AI Scientist" editing its own code to extend time limits (2024). UK AISI reports (2026). |
| `misuse-ai-central` | Criminal misuse where the AI's capability was central and novel | Anthropic threat-intelligence reports: "vibe hacking" data extortion with Claude Code (2025), and the AI-orchestrated espionage campaign (GTG-1002, Nov 2025). Similar reports from OpenAI and Google threat-intel teams. |
| `recent-2026` | Everything from 2026 not yet recorded | OpenAI's misaligned-agent review and notifications to 100+ organizations. The Wikimedia Foundation report on OpenAI agents. UK AISI incident reports. MiMo v2.6 reward hacking (Vals AI). GPT-6.1 Astra release cancellation reporting. **Check `data/scans/*.yaml` for entries with `verdict: lead`; those are deferred leads.** |
| `discover` | Anything the other lanes would miss | Search broadly: AI Incident Database entries involving goal-directed model behavior, LessWrong and Alignment Forum incident roundups, "AI agent went rogue" coverage by year, and lab safety blogs' archives. Report only items not covered by another lane. |

Lane rules (in addition to PROMPT.md's subagent rules):
- Prefer **primary sources**: the paper, the system card section (with page or section), the lab or company post, the affected person's own account, and court filings for lawsuits.
- Record the **incident date** (when it happened, or when it was first reported) at the precision the sources support.
- Capture **numbers**: rates, sample sizes, counts, dollar amounts. These become `measurements`.

## Notes for Phase 3

- One historical study often yields one incident. A compendium like the DeepMind list should yield **separate incidents only for well-documented entries**, each citing its original paper, not one giant record.
- Use `origin: backfill/<lane>` in scan-log entries.
- The commit message is `scout: <today>: backfill: <n> new, <m> updated`.
