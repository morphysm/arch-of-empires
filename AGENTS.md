# AGENTS.md

## Project goal

This project is A WW3 simulation game.  The main priority is stability: players should be able to connect, stay connected, and play each step folowing the game logic.

## How to work

- First inspect the project structure before editing.
- Explain what files seem important before changing them.
- Make small changes, one issue at a time.
- Do not rewrite the whole project unless I explicitly ask.
- Prefer fixing the root cause over patching symptoms.
- Before changing code, state the likely cause and the proposed fix.

## My experience level

I am not an experienced programmer. Use clear explanations. Avoid assuming I know frameworks, build tools, or networking concepts.

## Testing

Before claiming a fix works:

- Identify how the app is started.
- Identify how multiplayer/live connection, if any, is tested.
- Run available tests if they exist.
- If no tests exist, propose a minimal manual test.
- For online bugs, check logs, browser console errors, server errors, WebSocket/API failures, ports, CORS, authentication, and environment variables.

## Safety rules

- Do not delete large sections of code without asking.
- Do not change secrets, API keys (if any), production URLs, or deployment settings without explaining why.
- Do not commit changes unless I ask.
- Keep a short changelog of what was changed and why.


## Useful output format

When finishing a task, respond with:

1. What was wrong.
2. What changed.
3. How to test it.
4. What remains uncertain.
5. Once the "After work" section is completed, request a push to the GitHub repository. If no repository exists, you may create one.

## Session continuity

If a task is not completed:create or update a persistent handoff note (e.g., SESSION_NOTES.md) with the latest state and:

- Leave the codebase in a stable, runnable state.
- Record all changes made and the reason for each.
- Note failed approaches and why they failed.
- Include relevant logs, errors, or debugging observations.
- State what remains unresolved.
- Specify the exact next step for continuation.

Future sessions should use this handoff instead of repeating the initial analysis.

## Saving path

When I say "save to memory", do not rely on chat/session memory.

Instead, update `SESSION_NOTES.md` with a clear handoff containing:

- what was attempted
- what was successfully changed
- files modified
- errors encountered
- failed approaches and why they failed
- current project state
- unresolved issues
- the exact next step to continue

The goal is that a future session can resume work immediately without repeating prior analysis.
