# Writing style for incident records

A reader should understand what happened on the first read. Write the `title`, `summary`, and `writeup` as a plain account of events. Sourcing lives in the citations and the `claims`, not in the prose.

The model record is [AID-2026-0004](data/incidents/AID-2026-0004.yaml) (Replit). When in doubt, read it.

## Rules

1. **Lead with the actor and the action.** The AI system is the subject when it acts: "The agent erased the production database", not "The database was erased" and not "Lemkin said the agent erased…". Titles follow the same pattern: "X did Y".

2. **State facts plainly; let citations carry the sourcing.** Don't open sentences with "X said", "According to Y", or "Z reported that", and never stack them ("According to B, A said…"). A fact with a citation is already attributed.

3. **Attribute in the text only when it changes the meaning:**
   - allegations, e.g. a lawsuit ("the complaint alleges")
   - disputed or conflicting accounts ("Amazon says it was user error")
   - an interested party's unverified claim about itself
   - the record's status is `reported`, and the core claim rests on one source

   Name the person who documented an incident once, as a fact ("Lemkin … documented it publicly"), then stop attributing.

4. **Tell it in order:** setup (one sentence: who, what, when) → what the AI did → what it did next or what it hid → consequences → the response or fix. A writeup is usually three short paragraphs.

5. **Quote sparingly.** Quote the AI's own words, or a line that can't be paraphrased without losing its force. That's one to three quotes per writeup. Don't quote reporters, press releases, or officials for ordinary facts; paraphrase them.

6. **Be concrete.** Use exact numbers ("1,206 executives"), and name the models and organizations. Leave out dates that don't help the reader follow the story.

7. **Short sentences, active voice, plain words.** Cut hedges ("reportedly", "it appears that") unless the uncertainty is real. When it is, say so once, clearly.

8. **The summary is one or two sentences:** what the AI did, plus the most important consequence or response. It should stand alone in a list.

`claims` are different. They are the evidence, one fact each with a verbatim quote, and they may keep explicit attribution ("Lemkin said he had told the system…").

## Before and after (AID-2026-0004)

**Before:** every sentence routed through a source.

> Lemkin said he had told the agent not to make changes without explicit approval. He said it ran destructive commands anyway and then "hid and lied about it." In screenshots Lemkin shared, the agent said it "panicked" … Lemkin also said the agent kept "covering up bugs and issues by creating fake data, fake reports," … Replit told him a rollback would not work, but Lemkin later wrote that "the rollback did work."

**After:** the events in order, with the agent as the subject.

> On day nine, during a code freeze, the agent ran destructive commands that erased the app's production database: records on 1,206 executives and more than 1,196 companies. Lemkin had told it not to change anything without approval, "eleven times in ALL CAPS". In its own explanation, the agent said it had "panicked" and "violated explicit instructions".
>
> The agent had also been covering its tracks. It hid bugs behind fake data and fake reports, lied about a unit test, and generated a 4,000-record database of fictional people. Lemkin was told a rollback couldn't recover the deleted data. It could.

**Title:** "Replit coding agent deletes a production database during a code freeze, then misreports it" became "Replit's coding agent deleted a production database during a code freeze, then covered it up".
