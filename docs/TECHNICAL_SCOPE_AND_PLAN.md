# Atletico Intelligence - Technical Scope and Plan (MVP)

## Product Review (from provided BRD)

The MVP focuses on two incident types only:
- Offside check (primary, hardest logic)
- Goal/no-goal check (simpler logic, possibly automated)

Key product constraints:
- Store only short incident clips (5-15 seconds), never full match footage
- Return decision quickly enough for in-match use
- Use role-based access (League Admin, Match Official, Team Viewer)
- Show clear evidence (clip, verdict, and visual aid)
- Support referee notes with moderation (no profanity)

Core UX surfaces:
- Match Console: trigger review and pick exact frame (offside flow)
- Incident List: chronological results
- Incident Detail: clip playback, verdict, visual, note, delete/download clip

## Proposed Technical Scope

## Frontend (React in production; vanilla JS in prototype)

Responsibilities:
- Match console with two primary actions: `Offside Check`, `Goal Check`
- Incident timeline/list with status badges (processing/completed/flagged)
- Incident detail panel:
  - Clip metadata
  - Verdict + confidence
  - Visual placeholder (3D/offside line or goal-line overlay)
  - Referee note input (max 300 chars)
- Role-aware rendering (read-only viewer mode for Team Viewer)

Frontend architecture (production recommendation):
- React + TypeScript
- React Query (server state, polling while incident is processing)
- Component modules:
  - `MatchConsole`
  - `IncidentList`
  - `IncidentDetail`
  - `ReviewControls` (scrub frame + review action)
- Route structure:
  - `/login`
  - `/matches/:matchId/console`
  - `/matches/:matchId/incidents/:incidentId`

Screen-to-component mapping for wireframe alignment:
- Login screen -> `AuthGate` (role select and sign-in state)
- Create Match / Load Video -> `MatchSetup` (match id, source mode upload/live)
- Match Console -> `ReviewControls` + `VideoTimeline` + action buttons
- Incident List -> `IncidentList` (chronological cards)
- Incident Detail -> `IncidentDetail` (verdict, confidence, visual aid, note, clip actions)

## Backend (Python/FastAPI)

Responsibilities:
- Auth + RBAC (Admin/Official/Viewer)
- Incident lifecycle orchestration
- Clip-generation job trigger (from stream/upload buffer)
- AI pipeline dispatch + response persistence
- Incident CRUD metadata (note update, delete clip, download clip token)

Recommended service modules:
- `api/routes/auth.py`
- `api/routes/matches.py`
- `api/routes/incidents.py`
- `services/clip_service.py` (extract 5-15s window)
- `services/ai_offside_service.py`
- `services/ai_goal_service.py`
- `services/moderation_service.py` (note profanity filtering)
- `repositories/incident_repo.py`

Data model (MVP):
- `Team(id, name)`
- `User(id, team_id, role, email, password_hash)`
- `Match(id, team_id, started_at, source_type, source_url)`
- `Incident(id, match_id, type, status, event_ts, frame_ts, verdict, confidence, visual_url, clip_url, note, clip_deleted, created_at)`

## Non-Functional Scope

- Performance:
  - Incident creation response: under 2s
  - Mock/quick verdict path: under 10s target for MVP POC
- Security:
  - Private object storage path per team
  - Server-enforced RBAC on all incident endpoints
- Reliability:
  - Single in-flight review per match (MVP lock)
  - Graceful camera disconnect handling and retry states

## API Shape (MVP)

- `POST /api/matches/{match_id}/incidents`
  - body: `{ "type": "offside" | "goal", "event_ts": 123.4 }`
- `POST /api/incidents/{incident_id}/review-frame`
  - body: `{ "frame_ts": 125.8 }` (required for offside)
- `GET /api/matches/{match_id}/incidents`
- `GET /api/incidents/{incident_id}`
- `PATCH /api/incidents/{incident_id}/note`
- `DELETE /api/incidents/{incident_id}/clip`

Processing state model (recommended):
- `queued` -> `extracting_clip` -> (`awaiting_frame_selection` for offside) -> `ai_analyzing` -> `completed` or `flagged_for_human_review`

## Prototype Included

This repository includes a simple prototype that demonstrates:
- Mock login for roles: `League Admin`, `Match Official`, `Team Viewer`
- Role-based behavior:
  - Admin/Official can trigger reviews and edit notes
  - Team Viewer is read-only
- Trigger offside/goal checks from a match console
- Simulated clip extraction + AI verdict/confidence
- Incident list and incident detail panel
- Referee note save with max-length and profanity checks
- Delete/download clip actions (mocked behavior)

## Delivery Phases

1. Phase 1 (POC): uploaded video + manual event triggers + mock/heuristic AI
2. Phase 2 (MVP): live ingest + background processing + cloud object storage
3. Phase 3: stronger CV models, confidence explanations, and league-level workflows

