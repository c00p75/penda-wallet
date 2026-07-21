# Building Agentic Apps — Taught Through Penda

You've been building Penda, but the goal of this series is for you to actually
*understand* it: not just "it works," but why it's built this way, what
problems each piece solves, and what would break if it were built differently.

This isn't generic AI theory. Every lesson points at real files in this repo.
When you finish a module, you should be able to open the file it references
and follow the code without getting lost.

## Why this matters for Penda specifically

Your own [ROADMAP.md](../../ROADMAP.md) says it best:

> Penda is an AI-first money companion, not a budgeting app with a chatbot.

That's the whole course in one sentence. A "budgeting app with a chatbot"
means: normal CRUD app, plus a text box that calls an LLM to answer questions.
An "AI-first money companion" means: the LLM is a first-class actor that reads
your data, writes your data, remembers you, and sometimes acts *before you
ask*. That second thing is what "agentic" means, and it comes with a whole set
of engineering problems a plain CRUD app never has to solve:

- The model can be wrong, slow, or down. What happens then?
- The model can decide to delete your rent transaction. Who stops it?
- The model forgets everything between requests. How does it "remember" you?
- Two different AI providers speak completely different wire formats. How do
  you support both without duplicating your whole app?
- The model can only emit text. How does it actually change a database row?

Every module below is one of these problems, solved, in your own codebase.

## How to use this

Read them in order the first time — each one builds on the last. After that,
treat it as a reference: jump to whichever module matches what you're working
on.

Keep two things open while you read: your editor (so you can jump to the
files cited) and a scratch note of questions. You already have the
instincts of a builder — this series is about attaching vocabulary and
mental models to instincts you've already been exercising.

## The map

| # | Module | The question it answers |
|---|--------|--------------------------|
| 01 | [What makes an app "agentic"](01-what-makes-an-app-agentic.md) | What's actually different about Penda vs. a normal app with an AI feature? |
| 02 | [Anatomy of the agent loop](02-anatomy-of-the-agent-loop.md) | What literally happens between a user's message and Penda's reply? |
| 03 | [Tool-calling mechanics](03-tool-calling-mechanics.md) | How does a model that only outputs text end up creating a database row? |
| 04 | [Permissions, trust & safety](04-permissions-trust-and-safety.md) | How do you stop the agent from wrecking someone's ledger? |
| 05 | [Business logic vs. agent logic](05-business-logic-vs-agent-logic.md) | What should the LLM decide, and what should plain code decide? |
| 06 | [Resilience & reliability](06-resilience-and-reliability.md) | What happens when the model is slow, down, or says something malformed? |
| 07 | [Proactive agents](07-proactive-agents.md) | How does Penda message you *without* you opening the app first? |
| 08 | [Multimodal tools](08-multimodal-tools.md) | How does a receipt photo or a voice note become a transaction? |
| 09 | [Frontend integration](09-frontend-integration.md) | How does the UI show typing, tool progress, and confirm cards live? |
| 10 | [Testing agentic systems](10-testing-agentic-systems.md) | If the model is non-deterministic, what do you even test? |
| 11 | [Glossary & exercises](11-glossary-and-exercises.md) | Terms to know cold, plus hands-on tasks in this repo |

## The one file you'll see more than any other

Almost everything in modules 02–06 lives in one file:
[`supabase/functions/chat-message/index.ts`](../../supabase/functions/chat-message/index.ts).
It's over 2,000 lines, and by the end of this series you'll be able to read
all of it. Don't open it cold right now — each module will walk you into a
specific slice of it with line numbers.

Next: [01 — What makes an app "agentic"](01-what-makes-an-app-agentic.md)
