import json
import time
from pathlib import Path
from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from moviepy.video.io.VideoFileClip import VideoFileClip
from pydantic import BaseModel, Field


app = FastAPI(title="Atletico Intelligence Prototype API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


BAD_WORDS = {"damn", "idiot", "stupid"}
INCIDENTS: dict[str, dict] = {}
MATCHES: dict[str, dict] = {}
LEAGUES: dict[str, dict] = {}
TEAMS: dict[str, dict] = {}
USERS: dict[str, dict] = {}
ALLOWED_ROLES = {"league_admin", "match_official", "team_viewer"}
TERMINAL_STATUSES = {"completed", "flagged_for_human_review"}
ACTIVE_STATUSES = {"queued", "extracting_clip", "awaiting_frame_selection", "ai_analyzing"}
DATA_PATH = Path(__file__).with_name("data_store.json")
STORAGE_PATH = Path(__file__).with_name("storage")
SOURCE_PATH = STORAGE_PATH / "source"
CLIPS_PATH = STORAGE_PATH / "clips"
SNAPSHOTS_PATH = STORAGE_PATH / "snapshots"
STORAGE_PATH.mkdir(exist_ok=True)
SOURCE_PATH.mkdir(parents=True, exist_ok=True)
CLIPS_PATH.mkdir(parents=True, exist_ok=True)
SNAPSHOTS_PATH.mkdir(parents=True, exist_ok=True)


def _load_data() -> None:
    if not DATA_PATH.exists():
        return
    try:
        payload = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    INCIDENTS.update(payload.get("incidents", {}))
    MATCHES.update(payload.get("matches", {}))
    LEAGUES.update(payload.get("leagues", {}))
    TEAMS.update(payload.get("teams", {}))
    USERS.update(payload.get("users", {}))


def _persist_data() -> None:
    DATA_PATH.write_text(
        json.dumps({"incidents": INCIDENTS, "matches": MATCHES, "leagues": LEAGUES, "teams": TEAMS, "users": USERS}, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )


_load_data()
app.mount("/storage", StaticFiles(directory=str(STORAGE_PATH)), name="storage")


class MockLogin(BaseModel):
    role: Literal["league_admin", "match_official", "team_viewer"]
    team_id: str = "team-demo-001"


class IncidentCreate(BaseModel):
    type: Literal["offside", "goal"]
    event_ts: float = Field(ge=0)


class MatchCreate(BaseModel):
    source_type: Literal["upload", "live"] = "upload"
    source_label: str = "uploaded_video.mp4"


class FrameReview(BaseModel):
    frame_ts: float = Field(ge=0)


class NoteUpdate(BaseModel):
    note: str = Field(max_length=300)

class LeagueCreate(BaseModel):
    name: str
    season: str
    start_date: str
    end_date: str
    description: str = ""
    status: Literal["Active", "Draft", "Archived"] = "Active"
    max_teams: int = 20

class TeamCreate(BaseModel):
    name: str
    league_id: str
    players: int = 0
    contact: str = ""
    status: Literal["Active", "Inactive", "Suspended"] = "Active"

class UserCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    role: Literal["league_admin", "match_official", "team_viewer"]
    team_id: Optional[str] = None

class ModerateIncident(BaseModel):
    action: Literal["override", "flag", "archive"]
    new_verdict: Optional[str] = None
    note: Optional[str] = None


def _analyze_video_for_verdict(match: dict, incident: dict) -> dict:
    """Analyze video properties to make more intelligent verdict decisions"""
    source_file = _get_source_file(match)
    analysis = {
        'has_real_video': False,
        'duration': 0,
        'fps': 0,
        'size': (0, 0),
        'file_size_mb': 0,
        'is_goal_video': False
    }

    if source_file and source_file.exists():
        try:
            analysis['file_size_mb'] = source_file.stat().st_size / (1024 * 1024)
            with VideoFileClip(str(source_file)) as video:
                analysis['has_real_video'] = True
                analysis['duration'] = video.duration
                analysis['fps'] = video.fps
                analysis['size'] = video.size

                # Check if this looks like a goal video based on filename
                if 'goal' in str(source_file).lower():
                    analysis['is_goal_video'] = True

        except Exception as e:
            print(f"Video analysis failed: {e}")

    return analysis


def _mock_offside_verdict(frame_ts: Optional[float], video_analysis: dict = None) -> tuple[str, float, str]:
    if frame_ts is None:
        return "Needs Frame Selection", 0.35, "low_confidence"

    # Use video analysis for more intelligent decisions
    if video_analysis and video_analysis.get('has_real_video'):
        # For real videos, use more sophisticated analysis
        frame_int = int(frame_ts * 10)

        # Analyze based on video properties
        duration = video_analysis.get('duration', 0)
        fps = video_analysis.get('fps', 30)

        # Simulate computer vision analysis
        # In a real system, this would detect player positions, ball location, etc.

        # Base decision on frame position within the clip
        relative_position = frame_ts / duration if duration > 0 else 0.5

        # Offside more likely in attacking third of the field (simulate spatial analysis)
        # Use video size as a proxy for field analysis
        width, height = video_analysis.get('size', (1920, 1080))
        aspect_ratio = width / height if height > 0 else 1.0

        # Simulate that wider aspect ratios might indicate different camera angles
        field_factor = 0.5 + (aspect_ratio - 1.5) * 0.1

        # Combine factors for decision
        decision_score = (relative_position * 0.4) + (field_factor * 0.4) + ((frame_int % 100) / 100 * 0.2)

        is_offside = decision_score > 0.55

        # Higher confidence for real video analysis
        confidence = 0.88 + (frame_int % 12) * 0.005
        confidence = min(confidence, 0.96)

    else:
        # Fallback to improved mock logic for uploaded videos
        frame_int = int(frame_ts * 10)
        is_offside = (frame_int % 100) > 50

        if frame_int % 7 == 0:
            is_offside = not is_offside

        confidence = 0.85 + (frame_int % 10) * 0.01
        confidence = min(confidence, 0.95)

    verdict = "Offside" if is_offside else "Onside"
    return verdict, confidence, "completed"


def _mock_goal_verdict(event_ts: float, video_analysis: dict = None) -> tuple[str, float]:
    # Use video analysis for more intelligent goal detection
    if video_analysis and video_analysis.get('has_real_video'):
        # For real videos, simulate actual goal detection
        event_int = int(event_ts * 10)
        duration = video_analysis.get('duration', 0)
        file_size_mb = video_analysis.get('file_size_mb', 0)
        is_goal_video = video_analysis.get('is_goal_video', False)

        # If the filename suggests it's a goal video, be more likely to detect a goal
        if is_goal_video:
            base_goal_probability = 0.7  # 70% chance for goal videos
        else:
            base_goal_probability = 0.25  # 25% chance for regular videos

        # Adjust based on timing within the match
        relative_time = event_ts / duration if duration > 0 else 0.5

        # Goals more likely in second half (simulate match flow)
        if relative_time > 0.5:
            base_goal_probability += 0.15

        # Simulate goal line analysis - check if ball crosses virtual line
        # Use file size as a proxy for video complexity
        complexity_factor = min(file_size_mb / 50, 1.0)  # Normalize file size

        # Combine factors
        goal_score = base_goal_probability + (complexity_factor * 0.2) + ((event_int % 20) / 20 * 0.1)

        # Special case: if this is clearly a goal video, boost probability
        if 'goal' in video_analysis.get('source_file', '').lower():
            goal_score += 0.3

        is_goal = goal_score > 0.5

        # Higher confidence for real video analysis
        confidence = 0.82 + (event_int % 18) * 0.005
        confidence = min(confidence, 0.94)

    else:
        # Fallback to mock logic
        event_int = int(event_ts * 10)
        is_goal = (event_int % 10) < 3

        minute_marker = int(event_ts / 60)
        if minute_marker % 3 == 1:
            is_goal = (event_int % 10) < 5

        if event_int % 13 == 0:
            is_goal = False
        elif event_int % 17 == 0:
            is_goal = True

        confidence = 0.80 + (event_int % 20) * 0.01
        confidence = min(confidence, 0.92)

    verdict = "Goal" if is_goal else "No Goal"
    return verdict, confidence


def _set_status(incident: dict, new_status: str) -> None:
    if incident["status"] == new_status:
        return
    incident["status"] = new_status
    incident["processing_history"].append(
        {"status": new_status, "at": datetime.now(timezone.utc).isoformat()}
    )


def _advance_incident_state(incident: dict) -> None:
    if incident["status"] in TERMINAL_STATUSES:
        return

    now_ts = time.time()
    created_ts = incident["created_at_ts"]
    since_created = now_ts - created_ts

    if incident["type"] == "goal":
        if since_created < 2:
            _set_status(incident, "queued")
        elif since_created < 4:
            _set_status(incident, "extracting_clip")
        elif since_created < 6:
            _set_status(incident, "ai_analyzing")
        else:
            _set_status(
                incident,
                "completed" if incident["pending_confidence"] >= 0.6 else "flagged_for_human_review",
            )
            incident["verdict"] = incident["pending_verdict"]
            incident["confidence"] = incident["pending_confidence"]
        return

    # Offside pipeline waits on the official's frame selection.
    if incident["frame_ts"] is None:
        if since_created < 2:
            _set_status(incident, "queued")
        elif since_created < 4:
            _set_status(incident, "extracting_clip")
        else:
            _set_status(incident, "awaiting_frame_selection")
            incident["verdict"] = "Awaiting Frame Selection"
        return

    frame_reviewed_at = incident["frame_reviewed_at_ts"]
    since_frame_review = now_ts - frame_reviewed_at
    if since_frame_review < 2:
        _set_status(incident, "ai_analyzing")
    else:
        _set_status(
            incident,
            "completed" if incident["pending_confidence"] >= 0.6 else "flagged_for_human_review",
        )
        incident["verdict"] = incident["pending_verdict"]
        incident["confidence"] = incident["pending_confidence"]


def _validate_role(x_role: str | None) -> str:
    if not x_role or x_role not in ALLOWED_ROLES:
        raise HTTPException(status_code=401, detail="Missing or invalid role")
    return x_role


def _require_role(x_role: str | None, allowed: set[str]) -> str:
    role = _validate_role(x_role)
    if role not in allowed:
        raise HTTPException(status_code=403, detail=f"Role '{role}' is not allowed for this action")
    return role


def _require_team(x_team_id: str | None) -> str:
    if not x_team_id:
        raise HTTPException(status_code=401, detail="Missing team context")
    return x_team_id


def _require_match_access(match_id: str, team_id: str) -> dict:
    match = MATCHES.get(match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match["team_id"] != team_id:
        raise HTTPException(status_code=403, detail="No access to this match")
    return match


def _get_source_file(match: dict) -> Optional[Path]:
    if match.get("source_type") != "upload":
        return None
    file_name = match.get("source_file_name")
    if not file_name:
        return None
    path = SOURCE_PATH / file_name
    return path if path.exists() else None


def _build_clip_url(incident_id: str) -> str:
    return f"/storage/clips/{incident_id}.mp4"


def _extract_snapshot_for_incident(match: dict, incident: dict) -> None:
    """Extract a single frame snapshot from the video at the event timestamp"""
    source_file = _get_source_file(match)
    if not source_file:
        return

    snapshot_path = SNAPSHOTS_PATH / f"{incident['id']}.jpg"
    frame_ts = incident.get("frame_ts") or incident.get("event_ts", 0)
    
    try:
        video = VideoFileClip(str(source_file))
        # Clamp the timestamp to valid range
        frame_ts = min(max(frame_ts, 0), video.duration - 0.01)
        frame = video.get_frame(frame_ts)
        
        # Save frame as JPEG
        from imageio import imwrite
        imwrite(str(snapshot_path), frame)
        video.close()
        incident["snapshot_url"] = f"/storage/snapshots/{incident['id']}.jpg"
    except Exception as exc:
        print(f"Snapshot extraction failed for {incident['id']}: {exc}")


def _extract_clip_for_incident(match: dict, incident: dict) -> None:
    source_file = _get_source_file(match)
    if not source_file:
        return

    clip_path = CLIPS_PATH / f"{incident['id']}.mp4"
    clip_start, clip_end = incident["clip_window_sec"]
    try:
        video = VideoFileClip(str(source_file))
        clip_end = min(clip_end, video.duration)
        if clip_start >= clip_end:
            video.close()
            return
        clip = video.subclipped(clip_start, clip_end)
        # Write video file with updated MoviePy API
        clip.write_videofile(str(clip_path), codec="libx264")
        video.close()
        incident["clip_url"] = _build_clip_url(incident["id"])
    except Exception as exc:
        print(f"Clip extraction failed for {incident['id']}: {exc}")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "atletico-prototype-api"}


@app.post("/api/auth/mock-login")
def mock_login(payload: MockLogin) -> dict:
    return {
        "role": payload.role,
        "team_id": payload.team_id,
        "token": f"mock-{payload.role}-{payload.team_id}",
        "message": "Use role in X-Role header for prototype requests",
    }


@app.post("/api/matches/{match_id}")
def create_or_update_match(
    match_id: str,
    payload: MatchCreate,
    x_role: str | None = Header(default=None),
    x_team_id: str | None = Header(default=None),
) -> dict:
    _require_role(x_role, {"league_admin", "match_official"})
    team_id = _require_team(x_team_id)
    now = datetime.now(timezone.utc).isoformat()
    match = {
        "id": match_id,
        "team_id": team_id,
        "source_type": payload.source_type,
        "source_label": payload.source_label,
        "status": "active",
        "updated_at": now,
    }
    MATCHES[match_id] = match
    _persist_data()
    return match


@app.post("/api/matches/{match_id}/incidents")
def create_incident(
    match_id: str,
    payload: IncidentCreate,
    x_role: str | None = Header(default=None),
    x_team_id: str | None = Header(default=None),
) -> dict:
    _require_role(x_role, {"league_admin", "match_official"})
    team_id = _require_team(x_team_id)
    _require_match_access(match_id, team_id)

    same_match = [i for i in INCIDENTS.values() if i["match_id"] == match_id and i["team_id"] == team_id]
    for item in same_match:
        _advance_incident_state(item)
    match = MATCHES[match_id]
    if match["source_type"] == "upload" and not match.get("source_file_name"):
        raise HTTPException(status_code=400, detail="Uploaded source video is required before creating incidents")

    if any(item["status"] in ACTIVE_STATUSES for item in same_match):
        raise HTTPException(status_code=409, detail="Another review is currently in progress for this match")

    incident_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    clip_start = max(payload.event_ts - 5, 0)
    clip_end = payload.event_ts + 5

    incident = {
        "id": incident_id,
        "match_id": match_id,
        "team_id": team_id,
        "type": payload.type,
        "status": "queued",
        "event_ts": payload.event_ts,
        "frame_ts": None,
        "verdict": "Pending",
        "confidence": 0.0,
        "visual_type": "3d_offside_diagram" if payload.type == "offside" else "goal_line_overlay",
        "clip_window_sec": [round(clip_start, 2), round(clip_end, 2)],
        "clip_url": _build_clip_url(incident_id) if match["source_type"] == "upload" else "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        "snapshot_url": f"/mock-snapshots/{incident_id}.jpg",
        "clip_deleted": False,
        "note": "",
        "created_at": now,
        "created_at_ts": time.time(),
        "frame_reviewed_at_ts": None,
        "pending_verdict": None,
        "pending_confidence": 0.0,
        "processing_history": [{"status": "queued", "at": now}],
    }

    if payload.type == "goal":
        video_analysis = _analyze_video_for_verdict(match, incident)
        verdict, confidence = _mock_goal_verdict(payload.event_ts, video_analysis)
        incident["pending_verdict"] = verdict
        incident["pending_confidence"] = confidence

    if match["source_type"] == "upload":
        _extract_clip_for_incident(match, incident)
        _extract_snapshot_for_incident(match, incident)

    INCIDENTS[incident_id] = incident
    _advance_incident_state(incident)
    _persist_data()
    return incident


@app.post("/api/matches/{match_id}/source")
async def upload_match_source(
    match_id: str,
    file: UploadFile = File(...),
    x_role: str | None = Header(default=None),
    x_team_id: str | None = Header(default=None),
) -> dict:
    _require_role(x_role, {"league_admin", "match_official"})
    team_id = _require_team(x_team_id)
    match = _require_match_access(match_id, team_id)
    if match["source_type"] != "upload":
        raise HTTPException(status_code=400, detail="Match source is not upload")

    upload_name = f"{match_id}_{file.filename}"
    dest = SOURCE_PATH / upload_name
    contents = await file.read()
    dest.write_bytes(contents)
    match["source_file_name"] = upload_name
    match["source_label"] = file.filename
    _persist_data()
    return {
        "message": "Uploaded match source.",
        "source_file": upload_name,
        "source_url": f"/storage/source/{upload_name}",
    }


@app.post("/api/matches/{match_id}/goal-auto-detect")
def auto_detect_goal(
    match_id: str,
    payload: FrameReview,
    x_role: str | None = Header(default=None),
    x_team_id: str | None = Header(default=None),
) -> dict:
    _require_role(x_role, {"league_admin", "match_official"})
    team_id = _require_team(x_team_id)
    _require_match_access(match_id, team_id)
    return create_incident(
        match_id=match_id,
        payload=IncidentCreate(type="goal", event_ts=payload.frame_ts),
        x_role=x_role,
        x_team_id=x_team_id,
    )


@app.post("/api/incidents/{incident_id}/review-frame")
def review_offside_frame(
    incident_id: str,
    payload: FrameReview,
    x_role: str | None = Header(default=None),
    x_team_id: str | None = Header(default=None),
) -> dict:
    _require_role(x_role, {"league_admin", "match_official"})
    team_id = _require_team(x_team_id)
    incident = INCIDENTS.get(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident["team_id"] != team_id:
        raise HTTPException(status_code=403, detail="No access to this incident")
    if incident["type"] != "offside":
        raise HTTPException(status_code=400, detail="Frame review is only for offside incidents")

    verdict, confidence, _ = _mock_offside_verdict(payload.frame_ts, _analyze_video_for_verdict(MATCHES[incident["match_id"]], incident))
    incident["frame_ts"] = payload.frame_ts
    incident["frame_reviewed_at_ts"] = time.time()
    incident["pending_verdict"] = verdict
    incident["pending_confidence"] = confidence
    # Use analyzing first and let polling finalize the result.
    _set_status(incident, "ai_analyzing")
    _advance_incident_state(incident)
    _persist_data()
    return incident


@app.get("/api/matches")
def list_matches(x_role: str | None = Header(default=None), x_team_id: str | None = Header(default=None)) -> list[dict]:
    role = _validate_role(x_role)
    team_id = _require_team(x_team_id)
    if role == "league_admin":
        items = list(MATCHES.values())
    else:
        items = [m for m in MATCHES.values() if m.get("team_id") == team_id]
    
    for m in items:
        m_incidents = [i for i in INCIDENTS.values() if i["match_id"] == m["id"]]
        m["incident_count"] = len(m_incidents)
        m["offside_count"] = len([i for i in m_incidents if i["type"] == "offside"])
        m["goal_count"] = len([i for i in m_incidents if i["type"] == "goal"])
    return sorted(items, key=lambda m: m["updated_at"], reverse=True)


@app.get("/api/leagues")
def list_leagues(x_role: str | None = Header(default=None)) -> list[dict]:
    _require_role(x_role, {"league_admin"})
    return list(LEAGUES.values())


@app.post("/api/leagues")
def create_league(payload: LeagueCreate, x_role: str | None = Header(default=None)) -> dict:
    _require_role(x_role, {"league_admin"})
    l_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    league = {"id": l_id, "created_at": now, **payload.model_dump()}
    LEAGUES[l_id] = league
    _persist_data()
    return league


@app.get("/api/teams")
def list_teams(x_role: str | None = Header(default=None)) -> list[dict]:
    _require_role(x_role, {"league_admin"})
    items = list(TEAMS.values())
    for t in items:
        league = LEAGUES.get(t["league_id"])
        t["league_name"] = league["name"] if league else "Unknown"
    return items


@app.post("/api/teams")
def create_team(payload: TeamCreate, x_role: str | None = Header(default=None)) -> dict:
    _require_role(x_role, {"league_admin"})
    t_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    team = {"id": t_id, "created_at": now, **payload.model_dump()}
    TEAMS[t_id] = team
    _persist_data()
    return team


@app.post("/api/incidents/{incident_id}/moderate")
def moderate_incident(incident_id: str, payload: ModerateIncident, x_role: str | None = Header(default=None)) -> dict:
    _require_role(x_role, {"league_admin"})
    incident = INCIDENTS.get(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    if payload.action == "override":
        if not payload.new_verdict:
            raise HTTPException(status_code=400, detail="new_verdict required for override")
        incident["verdict"] = payload.new_verdict
        incident["status"] = "completed"
        _set_status(incident, "overridden_by_admin")
    elif payload.action == "flag":
        incident["status"] = "flagged_for_human_review"
        _set_status(incident, "flagged_for_human_review")
    elif payload.action == "archive":
        incident["status"] = "archived"
        _set_status(incident, "archived")
        
    if payload.note:
        incident["admin_note"] = payload.note
        
    _persist_data()
    return incident


@app.get("/api/matches/{match_id}/incidents")
def list_incidents(
    match_id: str, x_role: str | None = Header(default=None), x_team_id: str | None = Header(default=None)
) -> list[dict]:
    role = _validate_role(x_role)
    team_id = _require_team(x_team_id)
    _require_match_access(match_id, team_id)
    items = [i for i in INCIDENTS.values() if i["match_id"] == match_id and i["team_id"] == team_id]
    for item in items:
        _advance_incident_state(item)
    # Team viewers can see all incidents for their team, not just completed ones
    _persist_data()
    return sorted(items, key=lambda i: i["created_at"], reverse=True)


@app.get("/api/incidents/{incident_id}")
def get_incident(
    incident_id: str, x_role: str | None = Header(default=None), x_team_id: str | None = Header(default=None)
) -> dict:
    role = _validate_role(x_role)
    team_id = _require_team(x_team_id)
    incident = INCIDENTS.get(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident["team_id"] != team_id:
        raise HTTPException(status_code=403, detail="No access to this incident")
    _advance_incident_state(incident)
    # Team viewers can view all incidents for their team, just can't modify them
    _persist_data()
    return incident


@app.patch("/api/incidents/{incident_id}/note")
def update_note(
    incident_id: str,
    payload: NoteUpdate,
    x_role: str | None = Header(default=None),
    x_team_id: str | None = Header(default=None),
) -> dict:
    _require_role(x_role, {"league_admin", "match_official"})
    team_id = _require_team(x_team_id)
    incident = INCIDENTS.get(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident["team_id"] != team_id:
        raise HTTPException(status_code=403, detail="No access to this incident")

    note_lower = payload.note.lower()
    if any(bad_word in note_lower for bad_word in BAD_WORDS):
        raise HTTPException(status_code=400, detail="Note contains disallowed language")

    incident["note"] = payload.note
    _persist_data()
    return incident


@app.delete("/api/incidents/{incident_id}/clip")
def delete_clip(
    incident_id: str, x_role: str | None = Header(default=None), x_team_id: str | None = Header(default=None)
) -> dict:
    _require_role(x_role, {"league_admin", "match_official"})
    team_id = _require_team(x_team_id)
    incident = INCIDENTS.get(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident["team_id"] != team_id:
        raise HTTPException(status_code=403, detail="No access to this incident")

    incident["clip_deleted"] = True
    incident["clip_url"] = None
    _persist_data()
    return incident


@app.get("/api/incidents/{incident_id}/download")
def download_clip(
    incident_id: str, x_role: str | None = Header(default=None), x_team_id: str | None = Header(default=None)
):
    _validate_role(x_role)
    team_id = _require_team(x_team_id)
    incident = INCIDENTS.get(incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident["team_id"] != team_id:
        raise HTTPException(status_code=403, detail="No access to this incident")
    if incident["clip_deleted"] or not incident["clip_url"]:
        raise HTTPException(status_code=404, detail="Clip no longer exists in storage")
    
    # Get the actual clip file path
    clip_file = CLIPS_PATH / f"{incident_id}.mp4"
    if not clip_file.exists():
        raise HTTPException(status_code=404, detail="Clip file not found on disk")
    
    return FileResponse(
        path=clip_file,
        filename=f"incident_{incident_id}.mp4",
        media_type="video/mp4"
    )
