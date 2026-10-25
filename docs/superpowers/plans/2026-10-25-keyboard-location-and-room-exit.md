# Keyboard Location Selection and Multiplayer Room Exit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every round playable without a pointer by adding country/coordinate location input, and let a player safely leave a 2P lobby before the match starts.

**Architecture:** Country names and approximate centroids are derived from the already loaded country GeoJSON; coordinate input remains available if boundary data fails. Both paths call one `applyKeyboardGuess(lat, lng, label)` function so scoring, SVG markers, Realtime pin state, and submit behavior stay identical to globe clicks. A lobby-only `leaveMultiplayerLobby()` broadcasts cancellation, unsubscribes locally, resets room state, and returns focus to the start modal.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Globe.gl, Supabase Realtime, Node.js CDP E2E.

**Spec:** User request, 2026-10-25: keyboard location selection via country search and latitude/longitude input; a visible back/leave action for 2P play.

## Global Constraints

- Coordinate validation: latitude must be between -90 and 90; longitude must be between -180 and 180.
- Keyboard selection must use the same `currentPin` and `submitGuess()` path as pointer selection.
- Country search must fail gracefully if GeoJSON is unavailable; coordinate entry must still work.
- Leave is available only in the waiting lobby and must not silently abandon an active round.
- The UI must remain usable at 375px width and preserve existing arcade styling and SEO metadata.

## Review Focus

- Empty/invalid country and coordinate input shows an inline live error and does not enable submit.
- A valid country or coordinate selection creates one visual pin and enables the existing submit button.
- Host leave notifies a waiting guest and returns both browsers to the start modal.
- Guest leave returns only the guest to the start modal and does not start the match.
- Mobile quiz panel remains scrollable and does not hide the submit action.

---

### Task 1: Keyboard location picker

**Files:**
- Modify: `index.html`
- Modify: `scripts/validate-static-site.mjs`
- Modify: `scripts/test-solo-fallback.mjs`

**Interfaces:**
- Produces: `applyKeyboardGuess(lat, lng, label)`, `applyCountryGuess()`, `applyCoordinateGuess()`, `populateCountryOptions(features)`.
- Consumes: `currentPin`, `updateMapPins()`, `submitGuess()` and `myGlobe`.

- [x] Add failing static/E2E assertions for country search, coordinate fields, validation, and shared pin application.
- [x] Add accessible `details`/fieldset controls in the quiz panel with labels, datalist, latitude/longitude inputs, live status, and an apply button.
- [ ] Derive country names and centroids from loaded country features; populate the datalist without blocking the game.
- [x] Implement strict coordinate validation and shared marker application with a camera focus on the selected location.
- [x] Add a mobile max-height/scroll rule for the expanded quiz panel.
- [x] Run syntax, static, mobile modal, and keyboard selection E2E checks.

### Task 2: 2P lobby back/leave control

**Files:**
- Modify: `index.html`
- Modify: `scripts/validate-static-site.mjs`
- Modify: `scripts/test-multiplayer-start.mjs`

**Interfaces:**
- Produces: `leaveMultiplayerLobby()` and `resetMultiplayerLobbyState()`.
- Consumes: `roomChannel`, `roomCode`, `myRole`, `gamePhase`, `showModal()`.

- [x] Add a visible waiting-modal back button and a cancellation status contract.
- [x] Implement host/guest leave behavior, Realtime `room_cancelled` broadcast, unsubscribe/remove channel, and focus restoration.
- [x] Guard cancellation handling so it only affects lobby state and cannot interrupt active gameplay.
- [x] Run static, 2P start, 2P leave, and rematch regression checks.

### Task 3: Integration and deployment

**Files:**
- Verify: `index.html`, `scripts/validate-static-site.mjs`, E2E scripts

- [x] Run inline JavaScript syntax, static validation, 1P easy/normal/hard, no-selection, 2P start/no-selection/rematch, and new keyboard/leave tests.
- [ ] Commit and push the verified changes to `main`.
- [ ] Confirm Vercel Production contains the new picker and leave control.
