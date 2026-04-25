/* ============================================================
   Atlético Intelligence — Full Frontend Application
   ============================================================ */

const API_BASE =
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "localhost"
    ? "http://127.0.0.1:8000"
    : "https://prototype-test-production.up.railway.app";

const ACTIVE_STATUSES = new Set([
  "queued",
  "extracting_clip",
  "awaiting_frame_selection",
  "ai_analyzing",
]);

/* ===== APP STATE ===== */
let currentRole = null;
let currentTeamId = null;
let selectedIncidentId = null;
let pollTimer = null;
let incidentCache = [];
let currentIncidentFilter = "all";

/* ===== DOM REFS ===== */
const landingPage = document.getElementById("landingPage");
const loginOverlay = document.getElementById("loginOverlay");
const appShell = document.getElementById("appShell");
const roleSelect = document.getElementById("roleSelect");
const teamIdInput = document.getElementById("teamIdInput");
const loginBtn = document.getElementById("loginBtn");
const sessionInfo = document.getElementById("sessionInfo");
const sessionRoleLabel = document.getElementById("sessionRoleLabel");
const navList = document.getElementById("navList");
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");
const matchInfoEl = document.getElementById("matchInfo");

const matchIdInput = document.getElementById("matchId");
const videoSourceInput = document.getElementById("videoSource");
const videoFileInput = document.getElementById("videoFile");
const uploadVideoBtn = document.getElementById("uploadVideoBtn");
const uploadStatus = document.getElementById("uploadStatus");
const saveMatchBtn = document.getElementById("saveMatchBtn");
const eventTsInput = document.getElementById("eventTs");
const frameTsInput = document.getElementById("frameTs");
const offsideBtn = document.getElementById("offsideBtn");
const goalBtn = document.getElementById("goalBtn");
const autoGoalBtn = document.getElementById("autoGoalBtn");
const signOutBtn = document.getElementById("signOutBtn");

const listEl = document.getElementById("incidentList");
const incidentListEmpty = document.getElementById("incidentListEmpty");
const detailEl = document.getElementById("detail");
const historyTable = document.getElementById("historyTable");
const livePreviewVideo = document.getElementById("livePreviewVideo");
const liveScrubber = document.getElementById("liveScrubber");
const liveTimeLabel = document.getElementById("liveTimeLabel");
const filterAllBtn = document.getElementById("filterAllBtn");
const filterOffsideBtn = document.getElementById("filterOffsideBtn");
const filterGoalBtn = document.getElementById("filterGoalBtn");

/* ===== SCREEN CONFIG ===== */
const screenIds = [
  "dashboard",
  "match-history",
  "live-console",
  "incidents",
  "incident-detail",
  "team-list",
  "leagues",
  "league-detail",
  "official-detail",
];

const navByRole = {
  team_viewer: [
    { key: "dashboard", icon: "📊" },
    { key: "match-history", icon: "📋" },
    { key: "incidents", icon: "🎬" },
  ],
  match_official: [
    { key: "dashboard", icon: "📊" },
    { key: "live-console", icon: "🎮" },
    { key: "incidents", icon: "🎬" },
    { key: "match-history", icon: "📋" },
  ],
  league_admin: [
    { key: "dashboard", icon: "📊" },
    { key: "leagues", icon: "🏆" },
    { key: "league-detail", icon: "📝" },
    { key: "team-list", icon: "👥" },
    { key: "official-detail", icon: "👤" },
    { key: "live-console", icon: "🎮" },
    { key: "incidents", icon: "🎬" },
    { key: "incident-detail", icon: "🔍" },
    { key: "match-history", icon: "📋" },
  ],
};

const label = {
  dashboard: "Dashboard",
  "match-history": "Match History",
  "live-console": "Live Console",
  incidents: "Clips & Incidents",
  "incident-detail": "Incidents Log",
  "team-list": "Teams",
  leagues: "Leagues List",
  "league-detail": "League Detail Form",
  "official-detail": "Match Officials",
};

const subtitles = {
  dashboard: "Overview of recent activity and quick actions",
  "match-history": "Browse all past matches and incident archives",
  "live-console": "Active match review hub — trigger incident checks",
  incidents: "View all incident clips from your matches",
  "incident-detail": "Comprehensive incident review and documentation",
  "team-list": "Create, manage, and monitor all teams in the league",
  leagues: "Manage all leagues, seasons, and team configurations",
  "league-detail": "League configuration and settings",
  "official-detail": "Match official profile and assignments",
};

const roleLabels = {
  team_viewer: "Team Viewer",
  match_official: "Match Official",
  league_admin: "League Admin",
};

/* ===== EVENT BINDINGS ===== */
document.getElementById("landingOpenConsole").addEventListener("click", showLoginOverlay);
document.getElementById("landingSignIn").addEventListener("click", showLoginOverlay);
document.getElementById("heroGetStarted").addEventListener("click", showLoginOverlay);
document.getElementById("ctaGetStarted").addEventListener("click", showLoginOverlay);
document.getElementById("heroWatchDemo").addEventListener("click", showLoginOverlay);
loginBtn.addEventListener("click", login);
signOutBtn.addEventListener("click", signOut);
saveMatchBtn.addEventListener("click", saveMatch);
uploadVideoBtn.addEventListener("click", uploadMatchVideo);
offsideBtn.addEventListener("click", () => createIncident("offside"));
goalBtn.addEventListener("click", () => createIncident("goal"));
autoGoalBtn.addEventListener("click", autoDetectGoal);
filterAllBtn.addEventListener("click", () => applyIncidentFilter("all"));
filterOffsideBtn.addEventListener("click", () => applyIncidentFilter("offside"));
filterGoalBtn.addEventListener("click", () => applyIncidentFilter("goal"));
liveScrubber.addEventListener("input", () => {
  const t = Number(liveScrubber.value);
  livePreviewVideo.currentTime = t;
  liveTimeLabel.textContent = `Current frame time: ${t.toFixed(1)}s`;
});

/* ===== HELPERS ===== */
function canEdit() {
  return currentRole === "league_admin" || currentRole === "match_official";
}

function getMatchId() {
  return (matchIdInput.value || "match-demo-001").trim();
}

function showLoginOverlay() {
  landingPage.classList.add("hidden");
  loginOverlay.classList.remove("hidden");
}

function signOut() {
  currentRole = null;
  currentTeamId = null;
  selectedIncidentId = null;
  incidentCache = [];
  if (pollTimer) clearInterval(pollTimer);
  appShell.classList.add("hidden");
  landingPage.classList.remove("hidden");
}

/* ===== NAV RENDERING ===== */
function renderNav(activeKey = "dashboard") {
  navList.innerHTML = "";
  const items = navByRole[currentRole] || [];
  items.forEach(({ key, icon }) => {
    const btn = document.createElement("button");
    btn.className = `nav-item ${key === activeKey ? "active" : ""}`;
    btn.innerHTML = `${icon} ${label[key]}`;
    btn.onclick = () => {
      setActiveScreen(key);
      renderNav(key);
    };
    navList.appendChild(btn);
  });
}

function setActiveScreen(key) {
  screenIds.forEach((id) => {
    const el = document.getElementById(`screen-${id}`);
    if (!el) return;
    el.classList.toggle("hidden", id !== key);
  });
  pageTitle.textContent = label[key] || "Dashboard";
  pageSubtitle.textContent = subtitles[key] || "";

  // Trigger screen-specific renders
  if (key === "dashboard") renderDashboard();
  if (key === "leagues") renderLeagues();
  if (key === "team-list") renderTeamList();
  if (key === "league-detail") renderLeagueDetail();
  if (key === "official-detail") renderOfficialDetail();
  if (key === "match-history") renderHistory();
}

function updateControls() {
  const editable = canEdit();
  offsideBtn.disabled = !editable;
  goalBtn.disabled = !editable;
  autoGoalBtn.disabled = !editable;
}

/* ===== AUTH ===== */
async function login() {
  try {
    const payload = await request("/api/auth/mock-login", "POST", {
      role: roleSelect.value,
      team_id: teamIdInput.value || "team-demo-001",
    });
    currentRole = payload.role;
    currentTeamId = payload.team_id;
    sessionInfo.textContent = `${roleLabels[currentRole] || currentRole}`;
    sessionRoleLabel.textContent = `${currentTeamId} · ${currentRole}`;
    loginOverlay.classList.add("hidden");
    appShell.classList.remove("hidden");
    renderNav("dashboard");
    setActiveScreen("dashboard");
    updateControls();
    await saveMatch();
    await refreshIncidents();
    startPolling();
  } catch (err) {
    alert("Login failed: " + err.message);
  }
}

/* ===== MATCH MANAGEMENT ===== */
async function saveMatch() {
  try {
    const payload = await request(`/api/matches/${getMatchId()}`, "POST", {
      source_type: videoSourceInput.value,
      source_label:
        videoSourceInput.value === "live"
          ? "rtmp://camera/live"
          : "uploaded_video.mp4",
    });
    matchInfoEl.textContent = `${payload.id} (${payload.source_type})`;
    renderHistory();
  } catch (e) {
    console.warn("Match save:", e.message);
  }
}

async function uploadMatchVideo() {
  if (!canEdit()) return;
  if (!videoFileInput.files.length) {
    alert("Select a video file to upload.");
    return;
  }
  const form = new FormData();
  form.append("file", videoFileInput.files[0]);

  try {
    const res = await fetch(`${API_BASE}/api/matches/${getMatchId()}/source`, {
      method: "POST",
      headers: {
        "X-Role": currentRole || "",
        "X-Team-Id": currentTeamId || "",
      },
      body: form,
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.detail || "Video upload failed");
    }
    const payload = await res.json();
    uploadStatus.textContent = `✓ Uploaded ${payload.source_file}`;
    await refreshIncidents();
  } catch (err) {
    alert(err.message);
  }
}

/* ===== INCIDENT CREATION ===== */
async function createIncident(type) {
  if (!canEdit()) return;
  try {
    const incident = await request(
      `/api/matches/${getMatchId()}/incidents`,
      "POST",
      {
        type,
        event_ts: Number(eventTsInput.value || 0),
      }
    );
    if (type === "offside") {
      await request(`/api/incidents/${incident.id}/review-frame`, "POST", {
        frame_ts: Number(frameTsInput.value || 0),
      });
    }
    await refreshIncidents();
    setActiveScreen("incidents");
    renderNav("incidents");
  } catch (error) {
    alert(error.message);
  }
}

async function autoDetectGoal() {
  if (!canEdit()) return;
  try {
    await request(`/api/matches/${getMatchId()}/goal-auto-detect`, "POST", {
      frame_ts: Number(eventTsInput.value || 0),
    });
    await refreshIncidents();
  } catch (error) {
    alert(error.message);
  }
}

/* ===== INCIDENTS ===== */
async function refreshIncidents() {
  if (!currentRole) return;
  try {
    incidentCache = await request(`/api/matches/${getMatchId()}/incidents`);
  } catch (e) {
    incidentCache = [];
  }
  renderIncidents();
  if (selectedIncidentId) {
    const selected = incidentCache.find((x) => x.id === selectedIncidentId);
    if (selected) renderDetail(selected);
  }
}

function renderIncidents() {
  const filtered =
    currentIncidentFilter === "all"
      ? incidentCache
      : incidentCache.filter((i) => i.type === currentIncidentFilter);

  // Update filter buttons
  [filterAllBtn, filterOffsideBtn, filterGoalBtn].forEach((btn) =>
    btn.classList.remove("active")
  );
  if (currentIncidentFilter === "all") filterAllBtn.classList.add("active");
  else if (currentIncidentFilter === "offside") filterOffsideBtn.classList.add("active");
  else filterGoalBtn.classList.add("active");

  listEl.innerHTML = "";

  if (filtered.length === 0) {
    incidentListEmpty.style.display = "block";
  } else {
    incidentListEmpty.style.display = "none";
  }

  filtered.forEach((incident) => {
    const confidenceLabel =
      incident.confidence >= 0.8
        ? "High"
        : incident.confidence >= 0.6
        ? "Medium"
        : "Low";
    const confidenceClass =
      incident.confidence >= 0.8
        ? "badge-active"
        : incident.confidence >= 0.6
        ? "badge-warning"
        : "badge-error";

    const li = document.createElement("li");
    li.innerHTML = `
      <span class="badge badge-${incident.type}" style="padding:4px 10px;font-size:0.75rem;font-weight:700;text-transform:uppercase;">${incident.type}</span>
      <span class="incident-type">${incident.verdict}</span>
      <span class="incident-info">${Math.round(incident.event_ts)}s · ${new Date(incident.created_at).toLocaleTimeString()}</span>
      <span class="badge ${confidenceClass}">${(incident.confidence * 100).toFixed(0)}% ${confidenceLabel}</span>
      <span class="badge badge-${incident.status}">${incident.status.replace(/_/g, " ")}</span>
    `;
    li.onclick = () => {
      selectedIncidentId = incident.id;
      renderDetail(incident);
      setActiveScreen("incident-detail");
      renderNav("incident-detail");
    };
    listEl.appendChild(li);
  });
}

function applyIncidentFilter(filterType) {
  currentIncidentFilter = filterType;
  renderIncidents();
}

/* ===== INCIDENT DETAIL (Full BRD-compliant) ===== */
function renderDetail(incident) {
  const readonly = !canEdit();
  const isOffside = incident.type === "offside";
  const verdictClass = isOffside
    ? incident.verdict === "Offside"
      ? "offside"
      : "onside"
    : incident.verdict === "Goal"
    ? "goal"
    : "no-goal";

  const verdictDescription = isOffside
    ? `Attacking player (Riverside FC - J. Smith) is positioned ${
        incident.verdict === "Offside" ? "ahead of" : "behind"
      } the second-last defender at the precise moment the ball is played.`
    : `The ball ${
        incident.verdict === "Goal"
          ? "has fully crossed the goal line"
          : "did not fully cross the goal line"
      } based on virtual goal-line analysis.`;

  const confidenceLevel =
    incident.confidence >= 0.8
      ? "High"
      : incident.confidence >= 0.6
      ? "Medium"
      : "Low";

  const historyHtml = (incident.processing_history || [])
    .map(
      (s, idx) => `
      <div class="audit-item">
        <div class="audit-dot ${idx > 0 ? "secondary" : ""}"></div>
        <div class="audit-content">
          <div class="audit-time">${idx === 0 ? "Just now" : idx + " min ago"}</div>
          <div class="audit-text">${s.status.replace(/_/g, " ")}</div>
          <div class="audit-by">${s.status === "completed" ? "System" : "by J. Martinez"}</div>
        </div>
      </div>`
    )
    .join("");

  detailEl.innerHTML = `
    <div class="animate-in">
      <!-- Header -->
      <div class="incident-detail-header">
        <button class="back-btn" id="detailBackBtn">←</button>
        <span class="badge badge-${incident.type}" style="text-transform:uppercase;font-weight:700;">${incident.type}</span>
        <span class="incident-time">${Math.round(incident.event_ts)}s</span>
        <span style="font-size:1.05rem;font-weight:600;margin-left:4px;">Incident Detail</span>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button id="downloadClipBtn" class="secondary" style="font-size:0.82rem;">⬇ Download Clip</button>
          <button id="deleteClipBtn" class="btn-danger" style="font-size:0.82rem;" ${readonly ? "disabled" : ""}>🗑 Delete</button>
        </div>
      </div>

      <!-- Verdict + AI Rationale -->
      <div class="cards2-wide" style="margin-bottom:20px;">
        <div class="verdict-display" style="padding:0;">
          <div class="verdict-text ${verdictClass}">${incident.verdict}</div>
          <p class="verdict-desc">${verdictDescription}</p>
          <div class="confidence-row">
            <div class="confidence-item">
              <div class="ci-label">Confidence</div>
              <div class="ci-value">${(incident.confidence * 100).toFixed(0)}% (${confidenceLevel}) ${
    incident.confidence >= 0.8 ? "✅" : "⚠️"
  }</div>
            </div>
            <div class="confidence-item">
              <div class="ci-label">Snapshot</div>
              <div class="ci-value">Frame Locked 🔒</div>
            </div>
          </div>
        </div>
        <div class="ai-rationale">
          <h4>AI Rationale</h4>
          <ul class="rationale-list">
            ${
              isOffside
                ? `
              <li>Point of contact identified at frame #${Math.round((incident.frame_ts || incident.event_ts) * 100)}</li>
              <li>Last defender shoulder mapped</li>
              <li>Attacker trailing foot mapped</li>
              <li>Distance to goal line: Attacker +0.4m</li>
            `
                : `
              <li>Ball position tracked across 12 frames</li>
              <li>Virtual goal-line barrier applied</li>
              <li>Ball crossing confirmed at frame #${Math.round(incident.event_ts * 100)}</li>
              <li>Calibration confidence: ${(incident.confidence * 100).toFixed(0)}%</li>
            `
            }
          </ul>
        </div>
      </div>

      <!-- Video + 3D Positional -->
      <div class="cards2" style="margin-bottom:20px;">
        <div class="panel" style="margin-bottom:0;">
          <div class="tabs">
            <button class="tab active">Main Cam</button>
            <button class="tab">Tactical Cam</button>
            <button class="tab">AI Overlay</button>
          </div>
          ${
            incident.clip_url
              ? `
            <div class="video-container" style="margin-bottom:8px;">
              <video id="detailClip" controls style="border:none;border-radius:var(--radius-md) var(--radius-md) 0 0;">
                <source src="${incident.clip_url}" type="video/mp4" />
              </video>
              <div style="position:absolute;top:12px;right:12px;">
                <span class="frame-badge">Frame #${Math.round((incident.frame_ts || incident.event_ts) * 100)}</span>
              </div>
            </div>
          `
              : `<div style="padding:40px;text-align:center;color:var(--text-muted);background:var(--bg-input);border-radius:var(--radius-md);">
                <p style="font-size:1rem;margin-bottom:4px;">Clip deleted from storage</p>
                <p style="font-size:0.82rem;">Metadata retained for audit purposes.</p>
              </div>`
          }
          <div class="playback-controls">
            <button class="play-btn">▶</button>
            <div class="progress-bar">
              <div class="progress-fill" style="width:35%;">
                <div class="progress-thumb"></div>
              </div>
            </div>
            <span style="font-size:0.78rem;color:var(--text-muted);">0:04 / 0:12</span>
          </div>
          <div class="row" style="justify-content:space-between;margin-top:4px;">
            <div class="skip-btns">
              <button class="skip-btn">|◀</button>
              <button class="skip-btn">-1f</button>
              <button class="skip-btn">+1f</button>
              <button class="skip-btn">▶|</button>
            </div>
            <span style="font-size:0.75rem;color:var(--text-muted);">Stored clip playback (5-15s)</span>
            <button class="action-icon" title="Fullscreen">⛶</button>
          </div>
        </div>

        <div class="panel" style="margin-bottom:0;">
          <div class="row-between" style="margin-bottom:12px;">
            <h3>3D Positional Visual</h3>
            <div class="toggle-group">
              <button class="toggle-btn active">Top down</button>
              <button class="toggle-btn">Perspective</button>
            </div>
          </div>
          ${renderPitchDiagram(incident)}
          <div class="row" style="justify-content:center;gap:20px;margin-top:10px;">
            <span style="font-size:0.78rem;display:flex;align-items:center;gap:5px;">
              <span style="width:10px;height:10px;border-radius:50%;background:var(--status-info);display:inline-block;"></span>
              Riverside FC (Attacking)
            </span>
            <span style="font-size:0.78rem;display:flex;align-items:center;gap:5px;">
              <span style="width:10px;height:10px;border-radius:50%;background:var(--status-error);display:inline-block;"></span>
              North End (Defending)
            </span>
          </div>
        </div>
      </div>

      <!-- Referee Notes + Audit Trail -->
      <div class="cards2" style="margin-bottom:20px;">
        <div class="referee-notes">
          <div class="referee-notes-header">
            <h4>Referee Notes</h4>
            <span class="note-status badge ${incident.note ? 'badge-active' : 'badge-draft'}">${incident.note ? 'Saved' : 'Draft'}</span>
          </div>
          <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px;">Optional · Max 300 characters · Profanity filtered</p>
          <textarea id="note" rows="3" placeholder="Add referee notes about this incident..." ${readonly ? "disabled" : ""}>${incident.note || ""}</textarea>
          <div class="row-between" style="margin-top:8px;">
            <div class="row" style="gap:6px;">
              <span style="font-size:0.78rem;color:var(--text-muted);">📎 Attach Clip</span>
              <span id="charCounter" class="char-counter">${(incident.note || "").length} / 300</span>
            </div>
            <div class="btn-group">
              <button id="saveNoteBtn" class="secondary" ${readonly ? "disabled" : ""}>Save Draft</button>
              <button id="finalizeBtn" style="background:var(--status-error);color:white;font-size:0.82rem;" ${readonly ? "disabled" : ""}>Finalize Recommendation</button>
            </div>
          </div>
        </div>

        <div class="audit-trail">
          <h4>Audit Trail</h4>
          ${historyHtml || '<p style="color:var(--text-muted);font-size:0.85rem;">No timeline yet</p>'}
        </div>
      </div>

      <!-- Frame Review (for offside) -->
      ${
        isOffside
          ? `
        <div class="panel" style="margin-bottom:20px;">
          <h3 style="margin-bottom:12px;">Frame Review</h3>
          <label for="detailFrameTs">Select exact frame for analysis</label>
          <input id="detailFrameTs" type="range" min="0" max="30" step="0.1" value="${Number(
            incident.frame_ts || incident.event_ts || 0
          ).toFixed(1)}" />
          <p id="detailFrameTsLabel" style="font-size:0.82rem;color:var(--text-muted);">Selected frame: ${Number(
            incident.frame_ts || incident.event_ts || 0
          ).toFixed(1)}s</p>
          <button id="reviewFrameBtn" ${readonly ? "disabled" : ""} style="margin-top:8px;">🔍 Review This Frame</button>
        </div>
      `
          : ""
      }

      <!-- AI Analysis Details -->
      <div class="panel" style="margin-bottom:20px;">
        <h3 style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <span style="color:var(--accent-primary);">🤖</span> AI Analysis Details
        </h3>
        <div class="ai-analysis">
          <div class="ai-metric">
            <h4>Model Signals</h4>
            <div class="metric-row">
              <span>Position Detection</span>
              <span class="metric-val">98%</span>
            </div>
            <div class="metric-row">
              <span>Contact Point</span>
              <span class="metric-val">96%</span>
            </div>
            <div class="metric-row">
              <span>Line Calibration</span>
              <span class="metric-val">94%</span>
            </div>
          </div>
          <div class="ai-metric">
            <h4>Evidence Frames</h4>
            <div class="evidence-frames" style="margin-top:8px;">
              <div class="evidence-frame primary">#${Math.round((incident.frame_ts || incident.event_ts) * 100)}</div>
              <div class="evidence-frame">#${Math.round((incident.frame_ts || incident.event_ts) * 100) - 1}</div>
              <div class="evidence-frame">#${Math.round((incident.frame_ts || incident.event_ts) * 100) + 1}</div>
            </div>
            <p style="font-size:0.75rem;color:var(--text-muted);margin-top:10px;">Primary frame locked for analysis</p>
          </div>
          <div class="ai-metric">
            <h4>Measurement Data</h4>
            <div class="metric-row">
              <span>Distance from line</span>
              <span class="metric-val">+0.4m</span>
            </div>
            <div class="metric-row">
              <span>Calibration error</span>
              <span class="metric-val">±0.05m</span>
            </div>
            <div class="metric-row">
              <span>Camera angle</span>
              <span class="metric-val">12°</span>
            </div>
          </div>
        </div>
      </div>
      ${currentRole === 'league_admin' ? `
      <!-- Admin Moderation -->
      <div class="panel" style="margin-bottom:20px; border-color: var(--accent-purple);">
        <h3 style="color:var(--accent-purple-hover); margin-bottom:12px;">Admin Moderation</h3>
        <div class="form-grid">
          <div class="form-field">
            <label>Override Verdict</label>
            <select id="adminOverrideVerdict">
              <option value="">Keep current verdict</option>
              <option value="Offside">Offside</option>
              <option value="Onside">Onside</option>
              <option value="Goal">Goal</option>
              <option value="No Goal">No Goal</option>
            </select>
          </div>
          <div class="form-field full-width">
            <label>Admin Note</label>
            <textarea id="adminNote" rows="2" placeholder="Reason for moderation...">${incident.admin_note || ""}</textarea>
          </div>
        </div>
        <div class="btn-group" style="margin-top:12px;">
          <button id="adminOverrideBtn" style="background:var(--accent-purple);color:white;">Apply Override</button>
          <button id="adminFlagBtn" class="btn-danger">Flag for Review</button>
          <button id="adminArchiveBtn" class="secondary">Archive Incident</button>
        </div>
      </div>
      ` : ""}
      ${currentRole === 'team_viewer' ? `
      <!-- Team Viewer Combined View -->
      <div class="panel" style="margin-bottom:20px;">
        <h3 style="margin-bottom:12px;">Match History</h3>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Fixture</th>
                <th>Status</th>
                <th>Incidents</th>
                <th>Offside</th>
                <th>Goal</th>
              </tr>
            </thead>
            <tbody id="combinedHistoryTable"></tbody>
          </table>
        </div>
      </div>
      ` : ""}
    </div>
  `;

  // Wire up events
  document.getElementById("detailBackBtn").onclick = () => {
    setActiveScreen("incidents");
    renderNav("incidents");
  };

  const noteTextarea = document.getElementById("note");
  const charCounter = document.getElementById("charCounter");
  if (noteTextarea && charCounter) {
    noteTextarea.addEventListener("input", () => {
      const len = noteTextarea.value.length;
      charCounter.textContent = `${len} / 300`;
      if (len > 300) noteTextarea.value = noteTextarea.value.substring(0, 300);
    });
  }

  if (isOffside) {
    const detailFrameTs = document.getElementById("detailFrameTs");
    const detailFrameTsLabel = document.getElementById("detailFrameTsLabel");
    if (detailFrameTs && detailFrameTsLabel) {
      detailFrameTs.addEventListener("input", () => {
        detailFrameTsLabel.textContent = `Selected frame: ${Number(
          detailFrameTs.value
        ).toFixed(1)}s`;
      });
    }
    const reviewFrameBtn = document.getElementById("reviewFrameBtn");
    if (reviewFrameBtn) {
      reviewFrameBtn.onclick = async () => {
        try {
          await request(`/api/incidents/${incident.id}/review-frame`, "POST", {
            frame_ts: Number(detailFrameTs.value),
          });
          await refreshIncidents();
        } catch (error) {
          alert(error.message);
        }
      };
    }
  }

  document.getElementById("saveNoteBtn").onclick = async () => {
    try {
      await request(`/api/incidents/${incident.id}/note`, "PATCH", {
        note: document.getElementById("note").value,
      });
      await refreshIncidents();
    } catch (error) {
      alert(error.message);
    }
  };
  document.getElementById("finalizeBtn").onclick = async () => {
    try {
      await request(`/api/incidents/${incident.id}/note`, "PATCH", {
        note: document.getElementById("note").value,
      });
      alert("Recommendation finalized successfully.");
      await refreshIncidents();
    } catch (error) {
      alert(error.message);
    }
  };
  document.getElementById("deleteClipBtn").onclick = async () => {
    if (confirm("Delete this clip from storage? Metadata will be preserved.")) {
      await request(`/api/incidents/${incident.id}/clip`, "DELETE");
      await refreshIncidents();
    }
  };
  document.getElementById("downloadClipBtn").onclick = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/incidents/${incident.id}/download`, {
        headers: {
          "X-Role": currentRole || "",
          "X-Team-Id": currentTeamId || "",
        },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `incident_${incident.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message);
    }
  };

  if (currentRole === 'league_admin') {
    const overrideBtn = document.getElementById("adminOverrideBtn");
    if (overrideBtn) overrideBtn.onclick = async () => {
      const newVerdict = document.getElementById("adminOverrideVerdict").value;
      if (!newVerdict) return alert("Select a new verdict to override.");
      try {
        await request(`/api/incidents/${incident.id}/moderate`, "POST", {
          action: "override",
          new_verdict: newVerdict,
          note: document.getElementById("adminNote").value
        });
        await refreshIncidents();
      } catch (e) { alert(e.message); }
    };
    const flagBtn = document.getElementById("adminFlagBtn");
    if (flagBtn) flagBtn.onclick = async () => {
      try {
        await request(`/api/incidents/${incident.id}/moderate`, "POST", {
          action: "flag",
          note: document.getElementById("adminNote").value
        });
        await refreshIncidents();
      } catch (e) { alert(e.message); }
    };
    const archiveBtn = document.getElementById("adminArchiveBtn");
    if (archiveBtn) archiveBtn.onclick = async () => {
      try {
        await request(`/api/incidents/${incident.id}/moderate`, "POST", {
          action: "archive",
          note: document.getElementById("adminNote").value
        });
        await refreshIncidents();
      } catch (e) { alert(e.message); }
    };
  }

  if (currentRole === 'team_viewer') {
    request('/api/matches').then(matches => {
      const combinedTbody = document.getElementById("combinedHistoryTable");
      if (combinedTbody) {
        combinedTbody.innerHTML = matches.map((m) => `
          <tr>
            <td>${new Date(m.updated_at).toLocaleDateString()}</td>
            <td><strong>${m.id}</strong></td>
            <td><span class="badge badge-${m.status.toLowerCase()}">${m.status}</span></td>
            <td>${m.incident_count || 0}</td>
            <td>${m.offside_count || 0}</td>
            <td>${m.goal_count || 0}</td>
          </tr>
        `).join("") || '<tr><td colspan="6" style="text-align:center;">No matches found</td></tr>';
      }
    }).catch(console.error);
  }
}

/* ===== PITCH DIAGRAM RENDERER ===== */
function renderPitchDiagram(incident) {
  const isOffside = incident.type === "offside";
  return `
    <div class="pitch-diagram">
      <!-- Pitch lines -->
      <div class="pitch-line" style="top:0;left:0;right:0;height:2px;"></div>
      <div class="pitch-line" style="bottom:0;left:0;right:0;height:2px;"></div>
      <div class="pitch-line" style="top:0;bottom:0;left:0;width:2px;"></div>
      <div class="pitch-line" style="top:0;bottom:0;right:0;width:2px;"></div>
      <div class="pitch-line" style="top:0;bottom:0;left:50%;width:2px;"></div>
      <div class="pitch-center-circle"></div>

      <!-- Penalty area -->
      <div class="pitch-line" style="top:20%;bottom:20%;right:0;width:20%;border:2px solid rgba(255,255,255,0.15);border-right:none;background:transparent;"></div>
      <div class="pitch-line" style="top:30%;bottom:30%;right:0;width:8%;border:2px solid rgba(255,255,255,0.15);border-right:none;background:transparent;"></div>

      <!-- Offside line -->
      ${isOffside ? '<div class="offside-line" style="left:68%;"></div>' : ''}

      <!-- Ball -->
      <div class="player-dot ball" style="top:45%;left:${isOffside ? '55%' : '90%'};"></div>

      <!-- Defender -->
      <div class="player-dot defender" style="top:38%;left:${isOffside ? '70%' : '85%'};">DEF</div>

      <!-- Attacker -->
      <div class="player-dot attacker" style="top:55%;left:${isOffside ? '72%' : '92%'};">ATT</div>

      <!-- Additional players -->
      <div class="player-dot defender" style="top:25%;left:60%;opacity:0.5;">DEF</div>
      <div class="player-dot attacker" style="top:65%;left:50%;opacity:0.5;">ATT</div>
    </div>
  `;
}

/* ===== DASHBOARD ===== */
function renderDashboard() {
  const welcomeSection = document.getElementById("dashWelcome");
  const statsGrid = document.getElementById("dashStats");
  const recentPanel = document.getElementById("dashRecentMatches");
  const quickPanel = document.getElementById("dashQuickLinks");

  const matchCount = new Set(incidentCache.map((i) => i.match_id)).size || 3;
  const incidentCount = incidentCache.length || 8;
  const openCount = incidentCache.filter((i) => ACTIVE_STATUSES.has(i.status)).length;
  const userName = currentRole === "team_viewer" ? "Alex Chen" : currentRole === "match_official" ? "J. Martinez" : "League Admin";

  welcomeSection.innerHTML = `
    <h3>Welcome back, <strong>${userName}</strong></h3>
    <p>${
      currentRole === "team_viewer"
        ? 'You can review <span class="highlight" title="Completed and visible">approved</span> incident clips for your club after matches. You cannot edit clips, AI output, or trigger live reviews.'
        : currentRole === "match_official"
        ? "You can trigger offside and goal checks during live or uploaded match review."
        : "You can manage leagues, teams, matches, and override verdicts across the platform."
    }</p>
  `;

  if (currentRole === "team_viewer") {
    statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-label">Matches with clips</div>
        <div class="stat-value">${matchCount}</div>
        <div class="stat-sub">Completed · your access</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Available Incidents</div>
        <div class="stat-value" style="color:var(--accent-purple-hover);">${incidentCount}</div>
        <div class="stat-sub">Offside & goal reviews</div>
      </div>
      <div class="stat-card featured">
        <div class="stat-badge">Latest</div>
        <div style="font-size:1.05rem;font-weight:700;margin-bottom:4px;">Riverside vs North End</div>
        <div class="stat-sub">Mar 28, 2026 · 3 clips</div>
        <div class="stat-link" onclick="setActiveScreen('incidents');renderNav('incidents');">Browse clips →</div>
      </div>
    `;
  } else if (currentRole === "match_official") {
    statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-label">Active Match</div>
        <div class="stat-value">${getMatchId()}</div>
        <div class="stat-sub">Currently assigned</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Reviews Today</div>
        <div class="stat-value" style="color:var(--accent-purple-hover);">${incidentCount}</div>
        <div class="stat-sub">Offside & goal checks</div>
      </div>
      <div class="stat-card featured">
        <div class="stat-badge">Live</div>
        <div style="font-size:1.05rem;font-weight:700;margin-bottom:4px;">Match Console</div>
        <div class="stat-sub">Ready for incident reviews</div>
        <div class="stat-link" onclick="setActiveScreen('live-console');renderNav('live-console');">Open Console →</div>
      </div>
    `;
  } else {
    statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-label">Total Teams</div>
        <div class="stat-value">12</div>
        <div class="stat-sub">Across 2 leagues</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Total Matches</div>
        <div class="stat-value" style="color:var(--accent-purple-hover);">48</div>
        <div class="stat-sub">This season</div>
      </div>
      <div class="stat-card featured">
        <div class="stat-badge">Alerts</div>
        <div style="font-size:1.05rem;font-weight:700;margin-bottom:4px;">2 Pending Reviews</div>
        <div class="stat-sub">Low confidence verdicts flagged</div>
        <div class="stat-link" onclick="setActiveScreen('incidents');renderNav('incidents');">Review now →</div>
      </div>
    `;
  }

  recentPanel.innerHTML = `
    <div class="panel-header">
      <h3>Recent matches</h3>
      <a class="link-btn" onclick="setActiveScreen('match-history');renderNav('match-history');">All matches</a>
    </div>
    <div class="match-list-item">
      <span class="match-name">vs Riverside FC</span>
      <div class="match-meta"><span>Mar 28</span><span>${incidentCache.length || 3} clips</span></div>
    </div>
    <div class="match-list-item">
      <span class="match-name">vs Harbor SC</span>
      <div class="match-meta"><span>Mar 14</span><span>1 clip</span></div>
    </div>
    <div class="match-list-item">
      <span class="match-name">vs Valley United</span>
      <div class="match-meta"><span>Feb 22</span><span>4 clips</span></div>
    </div>
  `;

  quickPanel.innerHTML = `
    <div class="panel-header">
      <h3>Quick links</h3>
    </div>
    <div class="quick-links">
      <div class="quick-link-item" onclick="setActiveScreen('incidents');renderNav('incidents');">Open clips & incidents</div>
      <div class="quick-link-item" onclick="setActiveScreen('match-history');renderNav('match-history');">Match history</div>
    </div>
    <p style="font-size:0.75rem;color:var(--text-muted);margin-top:14px;">Only content approved for your role is shown. No access to other teams.</p>
  `;
}

/* ===== MATCH HISTORY ===== */
async function renderHistory() {
  try {
    const matches = await request('/api/matches');
    historyTable.innerHTML = matches.map((m) => `
      <tr>
        <td>${new Date(m.updated_at).toLocaleDateString()}</td>
        <td><strong>${m.id}</strong></td>
        <td><span class="badge badge-${m.status.toLowerCase()}">${m.status}</span></td>
        <td>${m.incident_count || 0}</td>
        <td>${m.offside_count || 0}</td>
        <td>${m.goal_count || 0}</td>
      </tr>
    `).join("") || '<tr><td colspan="6" style="text-align:center;">No matches found</td></tr>';
  } catch (err) {
    historyTable.innerHTML = '<tr><td colspan="6" style="text-align:center;">Failed to load matches</td></tr>';
  }
}

/* ===== LEAGUES (Admin) ===== */
async function renderLeagues() {
  const tbody = document.getElementById("leaguesTableBody");
  const statsBar = document.getElementById("leagueStatsBar");
  
  try {
    const leagues = await request('/api/leagues');
    tbody.innerHTML = leagues.map((l) => `
      <tr>
        <td><div class="checkbox"></div></td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="league-icon" style="background:rgba(16,185,129,0.1);font-size:1rem;">🏆</div>
            <div>
              <div style="font-weight:600;">${l.name}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${l.description || 'League'}</div>
            </div>
          </div>
        </td>
        <td>${l.season}</td>
        <td>${l.max_teams}</td>
        <td>-</td>
        <td>${new Date(l.created_at).toLocaleDateString()}</td>
        <td><span class="badge badge-${l.status.toLowerCase()}">${l.status}</span></td>
        <td>
          <div class="action-icons">
            <button class="action-icon" title="View">👁</button>
            <button class="action-icon" title="Delete">🗑</button>
            <button class="action-icon" title="More">⋯</button>
          </div>
        </td>
      </tr>
    `).join("") || '<tr><td colspan="8" style="text-align:center;">No leagues found</td></tr>';

    statsBar.innerHTML = `
      <div class="stat-bar-item">
        <div class="stat-bar-icon green">🏆</div>
        <div>
          <div class="stat-bar-value">${leagues.length}</div>
          <div class="stat-bar-label">Total Leagues</div>
        </div>
      </div>
    `;
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Failed to load leagues</td></tr>';
  }
}

/* ===== TEAM LIST (Admin) ===== */
async function renderTeamList() {
  const tbody = document.getElementById("teamListBody");
  try {
    const teams = await request('/api/teams');
    tbody.innerHTML = teams.map((t) => `
      <tr>
        <td><strong>${t.name}</strong></td>
        <td>${t.league_name || t.league_id}</td>
        <td>${t.players}</td>
        <td style="font-size:0.82rem;color:var(--text-muted);">${t.contact}</td>
        <td><span class="badge badge-${t.status.toLowerCase()}">${t.status}</span></td>
        <td>${new Date(t.created_at).toLocaleDateString()}</td>
        <td>
          <div class="action-icons">
            <button class="action-icon" title="Edit">✏️</button>
            <button class="action-icon" title="View Matches">📋</button>
            <button class="action-icon" title="Manage Users">👤</button>
            <button class="action-icon" title="Delete">🗑</button>
          </div>
        </td>
      </tr>
    `).join("") || '<tr><td colspan="7" style="text-align:center;">No teams found</td></tr>';
  } catch(err) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Failed to load teams</td></tr>';
  }
}

/* ===== LEAGUE DETAIL FORM ===== */
function renderLeagueDetail() {
  const el = document.getElementById("leagueDetailContent");
  el.innerHTML = `
    <div class="animate-in">
      <div class="panel">
        <h3>League Configuration</h3>
        <div class="form-grid">
          <div class="form-field">
            <label>League Name *</label>
            <input type="text" value="Metro Amateur League" />
          </div>
          <div class="form-field">
            <label>Season</label>
            <select><option>2026</option><option>2025</option><option>2024</option></select>
          </div>
          <div class="form-field">
            <label>Start Date</label>
            <input type="date" value="2026-01-15" />
          </div>
          <div class="form-field">
            <label>End Date</label>
            <input type="date" value="2026-12-15" />
          </div>
          <div class="form-field full-width">
            <label>Description</label>
            <textarea rows="3">Regional amateur soccer league for the metropolitan area. 20 teams competing across the season.</textarea>
          </div>
          <div class="form-field">
            <label>Status</label>
            <select><option>Active</option><option>Draft</option><option>Archived</option></select>
          </div>
          <div class="form-field">
            <label>Max Teams</label>
            <input type="number" value="20" />
          </div>
        </div>
        <div class="btn-group" style="margin-top:20px;">
          <button>Save Changes</button>
          <button class="secondary">Cancel</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3>Teams in this League (20)</h3>
          <button style="font-size:0.82rem;">+ Add Team</button>
        </div>
        <table class="table">
          <thead><tr><th>Team</th><th>Joined</th><th>Matches</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <tr><td><strong>North End</strong></td><td>Jan 2026</td><td>12</td><td><span class="badge badge-active">Active</span></td><td><button class="action-icon">🗑</button></td></tr>
            <tr><td><strong>Riverside FC</strong></td><td>Jan 2026</td><td>11</td><td><span class="badge badge-active">Active</span></td><td><button class="action-icon">🗑</button></td></tr>
            <tr><td><strong>Harbor SC</strong></td><td>Jan 2026</td><td>10</td><td><span class="badge badge-active">Active</span></td><td><button class="action-icon">🗑</button></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ===== OFFICIAL DETAIL / USER FORM (Admin) ===== */
function renderOfficialDetail() {
  const el = document.getElementById("officialDetailContent");
  el.innerHTML = `
    <div class="animate-in">
      <!-- Status Bar -->
      <div class="user-status-bar" style="border-radius:var(--radius-lg);margin-bottom:20px;">
        <span class="user-name">Michael Johnson</span>
        <span class="badge badge-active" style="margin-left:8px;">Verified</span>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button class="secondary" style="font-size:0.82rem;">Deactivate</button>
          <button style="background:var(--status-error);color:white;font-size:0.82rem;">Reset Password</button>
          <button class="secondary" style="font-size:0.82rem;">Demo</button>
          <button style="font-size:0.82rem;">Save Changes</button>
        </div>
      </div>

      <div class="admin-detail-grid">
        <div>
          <!-- Profile & Contact -->
          <div class="detail-section">
            <h3><span class="section-icon">👤</span> Profile & Contact</h3>
            <div class="form-grid">
              <div class="form-field"><label>Full Name *</label><input type="text" value="Michael" /></div>
              <div class="form-field"><label>Last Name *</label><input type="text" value="Johnson" /></div>
              <div class="form-field"><label>Preferred Name</label><input type="text" value="Mike J." /></div>
              <div class="form-field"><label>Preferred Name</label><input type="text" value="Mike" /></div>
              <div class="form-field"><label>Email *</label><input type="email" value="m.johnson@referee-uk.com" /></div>
              <div class="form-field"><label>Phone</label><input type="tel" value="+44 7911 123456" /></div>
              <div class="form-field full-width"><label>Emergency Contact</label><input type="text" value="+44 7911 654321" /></div>
              <div class="form-field full-width"><label>Address</label><input type="text" value="123 Football Lane, Manchester, M1 4AB" /></div>
            </div>
          </div>

          <!-- Official Details -->
          <div class="detail-section">
            <h3><span class="section-icon">⚽</span> Official Details</h3>
            <div class="form-grid">
              <div class="form-field"><label>Role Type *</label><select><option>Match Official</option><option>Video Referee</option><option>Assistant Referee</option></select></div>
              <div class="form-field"><label>Years Experience</label><input type="number" value="8" /></div>
              <div class="form-field"><label>Grade</label><select><option>Level 3 - County/District</option><option>Level 4 - Regional</option><option>Level 5 - National</option></select></div>
              <div class="form-field full-width"><label>Languages</label><input type="text" value="English, Spanish" /></div>
              <div class="form-field full-width"><label>Notes</label><textarea rows="2">Experienced match official with 8+ years in amateur and semi-professional leagues.</textarea></div>
            </div>
          </div>

          <!-- Certifications -->
          <div class="detail-section">
            <h3><span class="section-icon">📜</span> Certifications
              <button style="margin-left:auto;font-size:0.78rem;padding:5px 12px;" class="secondary">+ Add Certification</button>
            </h3>
            <table class="cert-table">
              <thead><tr><th>Certification Type</th><th>Issued By</th><th>Confirmed</th></tr></thead>
              <tbody>
                <tr><td>FA Level 3</td><td>The Football Association</td><td>FA-REF-2024-06-1234</td></tr>
                <tr><td>VAR Certified</td><td>FIFA</td><td>VAR-2025-UK-0567</td></tr>
              </tbody>
            </table>
            <div class="form-grid" style="margin-top:12px;">
              <div class="form-field"><label>Issue Date</label><input type="date" value="2023-01-01" /></div>
              <div class="form-field"><label>Expiry Date</label><input type="date" value="2026-01-01" /></div>
            </div>
            <div class="row" style="margin-top:8px;">
              <span class="badge badge-active">✓ Verified</span>
            </div>
          </div>

          <!-- Compliance -->
          <div class="detail-section">
            <h3><span class="section-icon">🛡️</span> Compliance</h3>
            <div class="form-grid">
              <div class="form-field"><label>Background Check Status</label><select><option>Cleared</option><option>Pending</option><option>Expired</option></select></div>
              <div class="form-field"><label>Background Check Date</label><input type="date" value="2025-05-01" /></div>
              <div class="form-field"><label>Safeguarding Certification</label><select><option>Valid</option><option>Expired</option><option>Not Required</option></select></div>
              <div class="form-field"><label>First Aid Certification</label><input type="date" value="2025-08-15" /></div>
            </div>
          </div>

          <!-- League Assignments -->
          <div class="detail-section">
            <h3><span class="section-icon">🏆</span> League Assignments</h3>
            <div style="display:flex;gap:6px;margin-bottom:12px;">
              <span class="tag">Premier League</span>
              <span class="tag" style="background:rgba(124,58,237,0.15);color:var(--accent-purple-hover);">Championship</span>
            </div>
            <div class="form-grid">
              <div class="form-field"><label>Assignment Start</label><input type="date" value="2025-01-01" /></div>
              <div class="form-field"><label>Assignment End</label><input type="date" value="2026-02-28" /></div>
            </div>
          </div>

          <!-- Availability -->
          <div class="detail-section">
            <h3><span class="section-icon">📅</span> Availability</h3>
            <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">Weekly Schedule</p>
            <div class="availability-row">
              <div class="day-dot available">M</div>
              <div class="day-dot available">T</div>
              <div class="day-dot">W</div>
              <div class="day-dot available">T</div>
              <div class="day-dot available">F</div>
              <div class="day-dot available">S</div>
              <div class="day-dot available">S</div>
            </div>
            <div class="form-grid" style="margin-top:12px;">
              <div class="form-field"><label>Blocked Dates</label><input type="text" placeholder="e.g. 2026-04-01" /></div>
              <div class="form-field"><label>Until</label><input type="text" placeholder="e.g. 2026-04-05" /></div>
            </div>
            <button style="font-size:0.78rem;padding:6px 12px;margin-top:8px;" class="secondary">+ Add blocked range</button>
            <p style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;">Mar 25, 2026 - Mar 29, 2026</p>
          </div>
        </div>

        <!-- Right column: Audit & History -->
        <div>
          <div class="detail-section">
            <h3>Audit & History</h3>
            <div class="audit-trail" style="border:none;padding:0;background:transparent;">
              <div class="audit-item">
                <div class="audit-dot"></div>
                <div class="audit-content">
                  <div class="audit-text">Created/Verified</div>
                  <div class="audit-time">Aug 18, 2023 by K Smith</div>
                </div>
              </div>
              <div class="audit-item">
                <div class="audit-dot secondary"></div>
                <div class="audit-content">
                  <div class="audit-text">Last Login</div>
                  <div class="audit-time">2 days ago</div>
                </div>
              </div>
            </div>
            <div style="margin-top:16px;">
              <h4 style="font-size:0.85rem;margin-bottom:10px;">Compliance</h4>
              <ul style="list-style:none;font-size:0.82rem;">
                <li style="padding:4px 0;display:flex;align-items:center;gap:6px;"><span style="color:var(--accent-primary);">✓</span> Certifications up to date</li>
                <li style="padding:4px 0;display:flex;align-items:center;gap:6px;"><span style="color:var(--accent-primary);">✓</span> Background check completed</li>
                <li style="padding:4px 0;display:flex;align-items:center;gap:6px;"><span style="color:var(--accent-primary);">✓</span> Safeguarding certification valid</li>
                <li style="padding:4px 0;display:flex;align-items:center;gap:6px;"><span style="color:var(--accent-primary);">✓</span> Insurance current</li>
                <li style="padding:4px 0;display:flex;align-items:center;gap:6px;"><span style="color:var(--accent-primary);">✓</span> First aid validated</li>
                <li style="padding:4px 0;display:flex;align-items:center;gap:6px;"><span style="color:var(--accent-primary);">✓</span> Photo uploaded</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ===== POLLING ===== */
function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!currentRole) return;
    try {
      const incidents = await request(`/api/matches/${getMatchId()}/incidents`);
      const active = incidents.some((i) => ACTIVE_STATUSES.has(i.status));
      incidentCache = incidents;
      renderIncidents();
      if (active && selectedIncidentId) {
        const selected = incidents.find((i) => i.id === selectedIncidentId);
        if (selected) renderDetail(selected);
      }
    } catch (_) {
      // no-op for polling
    }
  }, 2000);
}

/* ===== HTTP UTILITY ===== */
async function request(path, method = "GET", body) {
  const headers = {
    "X-Role": currentRole || "",
    "X-Team-Id": currentTeamId || "",
  };
  const options = { method, headers };

  if (body) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
  }

  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || "Request failed");
  }
  return res.json();
}
