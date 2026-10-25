# 2P Lobby Cleanup and Post-Join Fullscreen Implementation Plan

**Goal:** Ensure 2P lobby exit fully cleans up Realtime resources and defer fullscreen until the opponent has connected and the match actually starts.

**Architecture:** Centralize Realtime channel teardown in an async helper that waits for `unsubscribe()` completion, clears the guest room poll, and exposes a small diagnostic state for E2E verification. Remove the 2P button-time fullscreen request and invoke fullscreen best-effort only from the host/guest match-start event path.

**Tech Stack:** HTML, inline JavaScript, Supabase Realtime, Chromium CDP E2E tests.

## Review Focus

- Host exits before guest Realtime subscription: guest must return to the start modal through room deletion polling.
- Guest exits from the lobby: its channel and poll must close without deleting the host room.
- Realtime unsubscribe timeout/error: UI must still recover and record cleanup status.
- 2P button click: no fullscreen request before the opponent joins.
- Opponent joins: match-start path attempts fullscreen but never blocks gameplay when the browser rejects the request.

## Tasks

- [x] Add failing/diagnostic assertions for cleanup state and fullscreen call timing.
- [x] Add async Realtime teardown and await it from lobby exit.
- [x] Move 2P fullscreen request to host/guest match-start events.
- [x] Run syntax, static, and local E2E checks.
- [ ] Commit and push the verified change.
