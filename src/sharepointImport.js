// ─────────────────────────────────────────────────────────────────────────────
// One-time import of the old SharePoint lists into the QA service.
//
// Reads every row of the three lists with the manager's own Microsoft
// sign-in, converts them, and posts them to /api/import/sharepoint. Safe to
// run again: the QA service skips rows it already has.
// ─────────────────────────────────────────────────────────────────────────────

import { sharepointConfig } from "./authConfig";
import { FIELD_TO_SP_COLUMN } from "./questions";
import { importFromSharePoint } from "./qaApi";

const GRAPH_BASE =
  "https://graph.microsoft.com/v1.0/sites/allstardriver.sharepoint.com:/sites/ServiceExcellenceDepartment-ALL-CustomerServiceTeam:";

async function graphGet(token, url) {
  const res = await fetch(url.startsWith("https://") ? url : `${GRAPH_BASE}${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  });
  if (!res.ok) throw new Error(`SharePoint read failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function listId(token, displayName) {
  const data = await graphGet(token, `/lists?$filter=displayName eq '${displayName}'`);
  const list = (data.value || [])[0];
  if (!list) throw new Error(`SharePoint list "${displayName}" not found`);
  return list.id;
}

// Every item of a list, following Graph's paging (the old app stopped at 500).
async function allItems(token, displayName) {
  const id = await listId(token, displayName);
  let url = `/lists/${id}/items?$expand=fields&$top=500`;
  const items = [];
  while (url && items.length < 20000) {
    const page = await graphGet(token, url);
    items.push(...(page.value || []));
    url = page["@odata.nextLink"] || null;
  }
  return items;
}

// Match SharePoint column names loosely: "Q06_Greeting", "Q06_x005f_Greeting"
// and "Q06 Greeting" all normalize to "q06greeting".
function norm(name) {
  return String(name).toLowerCase().replace(/_x005f_/g, "").replace(/[^a-z0-9]/g, "");
}

function pick(fields, ...names) {
  const byNorm = {};
  for (const [k, v] of Object.entries(fields)) byNorm[norm(k)] = v;
  for (const n of names) {
    const v = byNorm[norm(n)];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function screeningFromItem(item) {
  const f = item.fields || {};
  const answers = {};
  for (const [field, column] of Object.entries(FIELD_TO_SP_COLUMN)) {
    const v = pick(f, column, field);
    if (v) answers[field] = v;
  }
  return {
    sharepointId: String(item.id),
    agentName: pick(f, "AgentName", "Agent", "Title"),
    agentEmail: pick(f, "AgentEmail"),
    evaluatorName: pick(f, "EvaluatorName", "Evaluator"),
    channel: pick(f, "Channel") || "Phone",
    contactId: String(pick(f, "ContactID", "ContactId") || ""),
    interactionDate: toIso(pick(f, "DateOfInteraction", "InteractionDate")),
    submittedAt: toIso(pick(f, "SubmissionDate", "Created") || item.createdDateTime),
    answers,
    scorePercent: pick(f, "ScorePercent", "TotalScore") || 0,
    passFail: pick(f, "PassFail"),
    suggestions: pick(f, "SuggestionsForImprovement"),
  };
}

function assignmentFromItem(item) {
  const f = item.fields || {};
  return {
    sharepointId: String(item.id),
    weekOf: (toIso(pick(f, "WeekOf")) || "").slice(0, 10) || null,
    evaluatorName: pick(f, "Evaluator", "EvaluatorName"),
    agentName: pick(f, "Agent", "AgentName"),
    contactId: String(pick(f, "ContactId", "ContactID") || ""),
    channel: pick(f, "Channel") || "Phone",
    interactionDate: toIso(pick(f, "InteractionDate")),
    durationSeconds: pick(f, "Duration") || null,
    skillName: pick(f, "SkillName"),
    status: pick(f, "Status") || "Pending",
  };
}

// Evaluator/Agent may be Person columns (lookup ids) or plain text.
async function pairsFromItems(token, items) {
  const resolved = {};
  async function person(lookupId) {
    if (!lookupId) return { name: "", email: "" };
    if (!resolved[lookupId]) {
      try {
        const u = await graphGet(token,
          `/lists('User Information List')/items/${lookupId}?$expand=fields($select=Title,EMail)`);
        resolved[lookupId] = { name: u.fields?.Title || "", email: u.fields?.EMail || "" };
      } catch {
        resolved[lookupId] = { name: "", email: "" };
      }
    }
    return resolved[lookupId];
  }

  const pairs = [];
  for (const item of items) {
    const f = item.fields || {};
    if (f.Active === false) continue;
    const keys = Object.keys(f);
    const evalLookup = keys.find((k) => /evaluator/i.test(k) && /lookupid/i.test(k));
    const agentLookup = keys.find((k) => /agent/i.test(k) && /lookupid/i.test(k));
    const evalText = keys.find((k) => /evaluator/i.test(k) && !/lookup/i.test(k));
    const agentText = keys.find((k) => /agent/i.test(k) && !/lookup|cxone/i.test(k));
    const evaluator = evalLookup ? await person(f[evalLookup]) : { name: f[evalText] || "", email: "" };
    const agent = agentLookup ? await person(f[agentLookup]) : { name: f[agentText] || "", email: "" };
    if (!agent.name) continue;
    pairs.push({
      sharepointId: String(item.id),
      evaluatorName: evaluator.name,
      evaluatorEmail: evaluator.email,
      agentName: agent.name,
      agentEmail: agent.email,
    });
  }
  return pairs;
}

// onProgress(message) is called as each step finishes.
export async function runSharePointImport(graphToken, onProgress = () => {}) {
  onProgress("Reading screenings from SharePoint…");
  const screeningItems = await allItems(graphToken, sharepointConfig.listName);
  onProgress(`Read ${screeningItems.length} screenings. Reading assignments…`);
  const assignmentItems = await allItems(graphToken, sharepointConfig.assignmentsListName);
  onProgress(`Read ${assignmentItems.length} assignments. Reading evaluator pairings…`);
  const pairItems = await allItems(graphToken, sharepointConfig.evaluatorAgentsListName);
  const pairs = await pairsFromItems(graphToken, pairItems);
  onProgress(`Read ${pairs.length} evaluator pairings. Saving to the QA database…`);

  const result = await importFromSharePoint({
    screenings: screeningItems.map(screeningFromItem),
    assignments: assignmentItems.map(assignmentFromItem),
    pairs,
  });
  return {
    read: {
      screenings: screeningItems.length,
      assignments: assignmentItems.length,
      pairs: pairs.length,
    },
    counts: result.counts,
  };
}
