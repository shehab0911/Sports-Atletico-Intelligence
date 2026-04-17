const API_BASE = "http://127.0.0.1:8000";
const ACTIVE_STATUSES = new Set(["queued", "extracting_clip", "awaiting_frame_selection", "ai_analyzing"]);
let currentRole = null;
let currentTeamId = null;
let selectedIncidentId = null;
let pollTimer = null;
let incidentCache = [];
let currentIncidentFilter = "all";

const loginOverlay = document.getElementById("loginOverlay");
const roleSelect = document.getElementById("roleSelect");
const loginBtn = document.getElementById("loginBtn");
const sessionInfo = document.getElementById("sessionInfo");
const navList = document.getElementById("navList");
const pageTitle = document.getElementById("pageTitle");
const matchInfo = document.getElementById("matchInfo");

const matchIdInput = document.getElementById("matchId");
const videoSourceInput = document.getElementById("videoSource");
const saveMatchBtn = document.getElementById("saveMatchBtn");
const eventTsInput = document.getElementById("eventTs");
const frameTsInput = document.getElementById("frameTs");
const offsideBtn = document.getElementById("offsideBtn");
const goalBtn = document.getElementById("goalBtn");
const autoGoalBtn = document.getElementById("autoGoalBtn");

const listEl = document.getElementById("incidentList");
const detailEl = document.getElementById("detail");
const historyTable = document.getElementById("historyTable");
const livePreviewVideo = document.getElementById("livePreviewVideo");
const liveScrubber = document.getElementById("liveScrubber");
const liveTimeLabel = document.getElementById("liveTimeLabel");
const filterAllBtn = document.getElementById("filterAllBtn");
const filterOffsideBtn = document.getElementById("filterOffsideBtn");
const filterGoalBtn = document.getElementById("filterGoalBtn");

const screenIds = [
  "dashboard",
  "match-history",
  "live-console",
  "incidents",
  "incident-detail",
  "team-list",
  "leagues",
];

const navByRole = {
  team_viewer: ["dashboard", "match-history", "incidents", "incident-detail"],
  match_official: ["dashboard", "live-console", "incidents", "incident-detail", "match-history"],
  league_admin: ["dashboard", "team-list", "leagues", "live-console", "incidents", "incident-detail", "match-history"],
};

const label = {
  dashboard: "Dashboard",
  "match-history": "Match History",
  "live-console": "Live Console",
  incidents: "Clips & Incidents",
  "incident-detail": "Incident Detail",
  "team-list": "Team List",
  leagues: "Leagues",
};

loginBtn.addEventListener("click", login);
saveMatchBtn.addEventListener("click", saveMatch);
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

function canEdit() {
  return currentRole === "league_admin" || currentRole === "match_official";
}

function getMatchId() {
  return (matchIdInput.value || "match-demo-001").trim();
}

function renderNav(activeKey = "dashboard") {
  navList.innerHTML = "";
  (navByRole[currentRole] || []).forEach((key) => {
    const btn = document.createElement("button");
    btn.className = `nav-item ${key === activeKey ? "active" : ""}`;
    btn.textContent = label[key];
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
}

function updateControls() {
  const editable = canEdit();
  offsideBtn.disabled = !editable;
  goalBtn.disabled = !editable;
  autoGoalBtn.disabled = !editable;
}

async function login() {
  const payload = await request("/api/auth/mock-login", "POST", {
    role: roleSelect.value,
    team_id: "team-demo-001",
  });
  currentRole = payload.role;
  currentTeamId = payload.team_id;
  sessionInfo.textContent = `${currentRole} | ${currentTeamId}`;
  loginOverlay.classList.add("hidden");
  renderNav("dashboard");
  setActiveScreen("dashboard");
  updateControls();
  await saveMatch();
  await refreshIncidents();
  startPolling();
}

async function saveMatch() {
  const payload = await request(`/api/matches/${getMatchId()}`, "POST", {
    source_type: videoSourceInput.value,
    source_label: videoSourceInput.value === "live" ? "rtmp://camera/live" : "uploaded_video.mp4",
  });
  matchInfo.textContent = `${payload.id} (${payload.source_type})`;
  renderHistory();
}

async function createIncident(type) {
  if (!canEdit()) return;
  try {
    const incident = await request(`/api/matches/${getMatchId()}/incidents`, "POST", {
      type,
      event_ts: Number(eventTsInput.value || 0),
    });
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

async function refreshIncidents() {
  if (!currentRole) return;
  incidentCache = await request(`/api/matches/${getMatchId()}/incidents`);
  renderIncidents();
  renderDashboardKpis();
  if (selectedIncidentId) {
    const selected = incidentCache.find((x) => x.id === selectedIncidentId);
    if (selected) renderDetail(selected);
  }
}

function renderIncidents() {
  const filtered =
    currentIncidentFilter === "all"
      ? incidentCache
      : incidentCache.filter((incident) => incident.type === currentIncidentFilter);

  listEl.innerHTML = "";
  filtered.forEach((incident) => {
    const confidenceLabel =
      incident.confidence >= 0.8 ? "High" : incident.confidence >= 0.6 ? "Medium" : "Low";
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${incident.type.toUpperCase()}</strong> ${Math.round(incident.event_ts)}s - ${incident.verdict}
      <span class="badge">${confidenceLabel}</span>
      <span class="badge badge-${incident.status}">${incident.status}</span>
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

function renderDetail(incident) {
  const readonly = !canEdit();
  const historyHtml = (incident.processing_history || [])
    .map((s) => `<li>${s.status} - ${new Date(s.at).toLocaleTimeString()}</li>`)
    .join("");
  detailEl.innerHTML = `
    <p><strong>Type:</strong> ${incident.type.toUpperCase()}</p>
    <p><strong>Verdict:</strong> ${incident.verdict}</p>
    <p><strong>Confidence:</strong> ${(incident.confidence * 100).toFixed(0)}%</p>
    <div class="panel">
      <h4>Stored Incident Clip (5-15s)</h4>
      ${
        incident.clip_url
          ? `<video id="detailClip" controls width="100%">
              <source src="${incident.clip_url}" type="video/mp4" />
            </video>`
          : "<p>Clip deleted from storage. Metadata retained.</p>"
      }
    </div>
    <div class="panel">
      <h4>Frame Review</h4>
      <label for="detailFrameTs">Frame timestamp (sec)</label>
      <input id="detailFrameTs" type="range" min="0" max="30" step="0.1" value="${Number(incident.frame_ts || incident.event_ts || 0).toFixed(1)}" />
      <p id="detailFrameTsLabel">Selected frame: ${Number(incident.frame_ts || incident.event_ts || 0).toFixed(1)}s</p>
      <button id="reviewFrameBtn" ${readonly || incident.type !== "offside" ? "disabled" : ""}>Review This Frame</button>
    </div>
    <div class="panel">
      <h4>Visual Evidence</h4>
      ${
        incident.type === "offside"
          ? `<div class="visual-box"><strong>3D Positional Diagram</strong><p>Last defender vs attacker projection at selected frame.</p></div>`
          : `<div class="visual-box"><strong>Goal-Line Overlay</strong><p>Ball crossing check against virtual goal-line barrier.</p></div>`
      }
    </div>
    <p><strong>Snapshot:</strong> ${incident.snapshot_url || "-"}</p>
    <p><strong>Status:</strong> <span class="badge badge-${incident.status}">${incident.status}</span></p>
    <p><strong>Audit trail:</strong></p>
    <ul>${historyHtml || "<li>No timeline yet</li>"}</ul>
    <label>Referee Note</label>
    <textarea id="note" rows="4" ${readonly ? "disabled" : ""}>${incident.note || ""}</textarea>
    <div class="row">
      <button id="saveNoteBtn" ${readonly ? "disabled" : ""}>Save Note</button>
      <button id="deleteClipBtn" class="secondary" ${readonly ? "disabled" : ""}>Delete Clip</button>
      <button id="downloadClipBtn" class="secondary">Download Clip</button>
    </div>
  `;
  const detailFrameTs = document.getElementById("detailFrameTs");
  const detailFrameTsLabel = document.getElementById("detailFrameTsLabel");
  if (detailFrameTs && detailFrameTsLabel) {
    detailFrameTs.addEventListener("input", () => {
      detailFrameTsLabel.textContent = `Selected frame: ${Number(detailFrameTs.value).toFixed(1)}s`;
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
  document.getElementById("saveNoteBtn").onclick = async () => {
    try {
      await request(`/api/incidents/${incident.id}/note`, "PATCH", { note: document.getElementById("note").value });
      await refreshIncidents();
    } catch (error) {
      alert(error.message);
    }
  };
  document.getElementById("deleteClipBtn").onclick = async () => {
    await request(`/api/incidents/${incident.id}/clip`, "DELETE");
    await refreshIncidents();
  };
  document.getElementById("downloadClipBtn").onclick = async () => {
    try {
      const payload = await request(`/api/incidents/${incident.id}/download`);
      alert(payload.download_url);
    } catch (error) {
      alert(error.message);
    }
  };
}

function applyIncidentFilter(filterType) {
  currentIncidentFilter = filterType;
  renderIncidents();
}

function renderDashboardKpis() {
  const matches = new Set(incidentCache.map((i) => i.match_id)).size;
  const open = incidentCache.filter((i) => ACTIVE_STATUSES.has(i.status)).length;
  document.getElementById("kpiMatches").textContent = String(matches);
  document.getElementById("kpiIncidents").textContent = String(incidentCache.length);
  document.getElementById("kpiOpen").textContent = String(open);
}

function renderHistory() {
  historyTable.innerHTML = `
    <tr><td>Mar 28, 2026</td><td>North End vs Riverside FC</td><td>Completed</td><td>${incidentCache.length}</td></tr>
    <tr><td>Mar 14, 2026</td><td>Harbor SC vs North End</td><td>Completed</td><td>1</td></tr>
  `;
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!currentRole) return;
    try {
      const incidents = await request(`/api/matches/${getMatchId()}/incidents`);
      const active = incidents.some((i) => ACTIVE_STATUSES.has(i.status));
      incidentCache = incidents;
      renderIncidents();
      renderDashboardKpis();
      if (active && selectedIncidentId) {
        const selected = incidents.find((i) => i.id === selectedIncidentId);
        if (selected) renderDetail(selected);
      }
    } catch (_) {
      // no-op for polling
    }
  }, 2000);
}

async function request(path, method = "GET", body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Role": currentRole || "",
      "X-Team-Id": currentTeamId || "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || "Request failed");
  }
  return res.json();
}
