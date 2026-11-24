// ─────────────────────────────────────────────────────────────────────────────
// QA service client (assignments, agent metrics, agent roster).
//
// The QA service checks the signed-in person's Microsoft sign-in, so no
// API key lives in this page. Anything placed in this page is public.
// ─────────────────────────────────────────────────────────────────────────────

import { msalInstance } from "./msalInstance";
import { loginRequest } from "./authConfig";

export const QA_SERVICE_URL = "https://support-qa-64ne.onrender.com";

async function getIdToken(forceRefresh = false) {
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  if (!account) throw new Error("Not signed in. Sign in again and retry.");
  const result = await msalInstance.acquireTokenSilent({ ...loginRequest, account, forceRefresh });
  return result.idToken;
}

// fetch() against the QA service with the user's Microsoft sign-in attached.
// Retries once with a refreshed sign-in if the service says it expired.
export async function qaFetch(path, options = {}) {
  const send = async (forceRefresh) => {
    const token = await getIdToken(forceRefresh);
    return fetch(`${QA_SERVICE_URL}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
  };
  const res = await send(false);
  return res.status === 401 ? send(true) : res;
}

// ── JSON helpers ────────────────────────────────────────────────────────────

// Calls the QA service and returns the parsed JSON. Throws an Error with the
// service's own message when the call fails.
export async function qaJson(path, { method = "GET", body } = {}) {
  const res = await qaFetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.error || `QA service error (${res.status})`);
  }
  return data;
}

// ── QA data (stored in the QA service's database) ───────────────────────────

export const TEAM_LABELS = {
  customer_support: "Customer Support",
  internal_support: "Internal Support",
};

// Unknown team values fall back to a neutral label instead of breaking.
export function teamLabel(team) {
  return TEAM_LABELS[team] || "Other";
}

export const getMe = () => qaJson("/api/me");

export function listScreenings({ from, to, team } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (team) params.set("team", team);
  const qs = params.toString();
  return qaJson(`/api/screenings${qs ? `?${qs}` : ""}`);
}

export const getScreening = (id) => qaJson(`/api/screenings/${id}`);
export const createScreening = (body) => qaJson("/api/screenings", { method: "POST", body });
export const updateScreening = (id, body) =>
  qaJson(`/api/screenings/${id}`, { method: "PUT", body });

export async function uploadAttachment(screeningId, file) {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await qaFetch(`/api/screenings/${screeningId}/attachments`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);
  return data;
}

// Downloads an attachment and returns a temporary object URL for it
// (for an <audio> player or a download link). Call URL.revokeObjectURL when done.
export async function attachmentUrl(attachmentId) {
  const res = await qaFetch(`/api/attachments/${attachmentId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Download failed (${res.status})`);
  }
  return URL.createObjectURL(await res.blob());
}

export const listAgents = () => qaJson("/api/agents");
export const updateAgent = (id, body) => qaJson(`/api/agents/${id}`, { method: "PUT", body });
export const createAgent = (body) => qaJson("/api/agents", { method: "POST", body });

export const listEvaluatorPairs = () => qaJson("/api/evaluator-pairs");
export const createEvaluatorPair = (body) =>
  qaJson("/api/evaluator-pairs", { method: "POST", body });
export const removeEvaluatorPair = (id) =>
  qaJson(`/api/evaluator-pairs/${id}`, { method: "DELETE" });

export const listAssignments = () => qaJson("/api/assignments");
export const saveAssignments = (body) =>
  qaJson("/api/assignments/batch", { method: "POST", body });
export const setAssignmentStatus = (id, status) =>
  qaJson(`/api/assignments/${id}`, { method: "PUT", body: { status } });
export const deleteAssignment = (id) => qaJson(`/api/assignments/${id}`, { method: "DELETE" });

export const importFromSharePoint = (body) =>
  qaJson("/api/import/sharepoint", { method: "POST", body });

// Screening row from the API → the shape the dashboard tables use.
export function toRecord(s) {
  const dateStr = s.interaction_date || s.submitted_at;
  return {
    id: s.id,
    agentName: s.agent_name || "",
    agentEmail: s.agent_email || "",
    evaluatorName: s.evaluator_name || "",
    channel: s.channel || "Phone",
    contactId: s.contact_id || "",
    scorePercent: s.score_percent ?? 0,
    passFail: s.pass_fail || "Fail",
    date: dateStr ? new Date(dateStr) : null,
    suggestions: s.suggestions || "",
    answers: s.answers || {},
    team: s.team || "customer_support",
    canEdit: !!s.can_edit,
    edited: !!s.updated_at,
    imported: !!s.imported,
    // false once a manager removes the person (Settings → Teams); older
    // service versions don't send it, so missing means active.
    agentActive: s.agent_active !== false,
  };
}

// Starting team for an agent the QA service doesn't know yet (e.g. a name
// that only appears in CXone metrics). Mirrors qa/teams.py in Support_QA;
// once an agent is stored, their saved team always wins.
const INTERNAL_FULL_NAMES = new Set(["lisa gilmore", "lisa farnsworth"]);
const INTERNAL_FIRST_NAMES = new Set(["melissa", "jodi", "stacie", "caitlyn"]);

export function nameKey(name) {
  return String(name || "").toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

export function defaultTeam(name) {
  const key = nameKey(name);
  if (INTERNAL_FULL_NAMES.has(key)) return "internal_support";
  if (INTERNAL_FIRST_NAMES.has(key.split(" ")[0])) return "internal_support";
  return "customer_support";
}
