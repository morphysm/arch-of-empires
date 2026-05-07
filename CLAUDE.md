# ARCH of EMPIRES

A nuclear WWIII terminal simulation. Geopolitical dread + metaphysical horror.
The terminal is the game. The game is unreliable. The player is complicit.

## Stack
- Svelte + Vite (frontend)
- Svelte stores (state — single source of truth in src/core/store.js)
- IndexedDB via idb (persistence — ghost system only)
- Tone.js (audio — procedural, no audio files)
- Pure HTML/CSS terminal (no canvas, no WebGL)

## Current Phase
Phase 6 — Endgame + Audio complete (2026-05-07).
Built: src/endgame/terminalStates.js (resolveTerminalState + checkEndgameConditions),
src/audio/soundscape.js (Tone.js procedural, no files),
WorldMap.svelte (functional, region status from feeds.tactical).
Terminal.svelte updated: endgame overlay uses resolveTerminalState(), WorldMap wired,
soundscape fires on feed events and anomaly manifestations.
413 tests pass.

## Rules
- All game logic lives in src/core/ and src/feeds/ — no logic in Svelte components
- Components are views only
- The Clock never resets between runs — it persists via IndexedDB
- Every anomaly manifestation must be traceable to an Aspect drawn at run start
- Tier 3 commands (PRAY, OBEY, TRANSCEND) modify victory conditions — never call them from Tier 1/2 logic
- REWRITE_ORIGIN is not in any command list. It exists only in tier3.js. It is never documented.

## Tier 3 Command Reveal Behavior

PRAY, OBEY, TRANSCEND, REWRITE_ORIGIN are never listed anywhere.
Before reveal conditions: input returns absolute silence.
No "COMMAND NOT RECOGNIZED". No feedback. Nothing.
After reveal conditions: execute normally.
The player cannot tell when the transition happened.

## What Is Out of Scope (Do Not Build)
- Multiplayer
- Backend/server
- Analytics
- Mobile layout

## Do Not Recreate
- package.json (exists, scaffold complete)
- vite.config.js (exists)
- index.html (exists)
- src/main.js (exists)
- src/app.css (exists)


## The Design Rule That Governs Everything
The terminal feels like a holy book written in assembly code.


## Doctrinal Texts
Full fragments and trigger conditions live in GDD.md — DOCTRINAL TEXTS section.
Claude Code must read that section before building any feed or command logic.
The trigger tables are the source of truth for when each fragment fires.

# NOTE -- After a section is complete you will update it's Current Phase here on your Claude-md.
