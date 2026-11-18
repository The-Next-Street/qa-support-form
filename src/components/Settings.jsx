import React, { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../authConfig";
import { COLORS, FONTS, GRADIENT } from "../brand";
import { headerStyles } from "./ui";
import {
  listAgents, updateAgent, listEvaluatorPairs, createEvaluatorPair, removeEvaluatorPair,
  TEAM_LABELS,
} from "../qaApi";
import { runSharePointImport } from "../sharepointImport";

// Managers only: who is on which team, who evaluates whom, and the one-time
// import of the old SharePoint records.

const s = {
  page: { minHeight: "100vh", background: COLORS.offWhite, padding: "24px 16px", fontFamily: FONTS.body },
  card: {
    maxWidth: 1100, margin: "0 auto 20px", background: COLORS.white, borderRadius: 12,
    border: "1px solid #E8E8E8", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden",
  },
  header: headerStyles.header,
  title: headerStyles.headerTitle,
  sub: headerStyles.headerSub,
  body: { padding: "22px 32px" },
  h2: { margin: "0 0 4px", fontSize: 17, fontFamily: FONTS.heading, color: COLORS.gray },
  hint: { margin: "0 0 14px", fontSize: 13, color: COLORS.midGray },
  input: {
    padding: "8px 10px", border: `1.5px solid ${COLORS.lightGray}`, borderRadius: 6,
    fontSize: 13, fontFamily: FONTS.body, minWidth: 0,
  },
  btn: (primary = true, disabled = false) => ({
    padding: "8px 16px", borderRadius: 6, border: `1.5px solid ${COLORS.orange}`,
    background: primary ? COLORS.orange : COLORS.white, color: primary ? COLORS.white : COLORS.orange,
    fontSize: 13, fontWeight: 600, fontFamily: FONTS.heading,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
  }),
  th: {
    textAlign: "left", padding: "8px 10px", background: COLORS.charcoal, color: COLORS.white,
    fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: FONTS.heading,
  },
  td: { padding: "8px 10px", borderBottom: `1px solid ${COLORS.lightGray}`, fontSize: 13, color: COLORS.gray },
  error: { color: COLORS.fail, fontSize: 13, margin: "8px 0" },
  ok: { color: COLORS.green, fontSize: 13, margin: "8px 0" },
};

function TeamsSection() {
  const [agents, setAgents] = useState([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    listAgents().then((d) => setAgents(d.agents || [])).catch((e) => setError(e.message));
  }, []);

  async function changeTeam(agent, team) {
    setSavingId(agent.id);
    setError(null);
    try {
      const saved = await updateAgent(agent.id, { team });
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, ...saved } : a)));
    } catch (e) {
      setError(`${agent.name}: ${e.message}`);
    } finally {
      setSavingId(null);
    }
  }

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return agents.filter((a) => !q || a.name.toLowerCase().includes(q));
  }, [agents, filter]);
  const counts = useMemo(() => {
    const c = { customer_support: 0, internal_support: 0 };
    agents.forEach((a) => { if (a.team in c) c[a.team] += 1; });
    return c;
  }, [agents]);

  return (
    <div style={s.body}>
      <h2 style={s.h2}>Teams</h2>
      <p style={s.hint}>
        {counts.customer_support} in Customer Support · {counts.internal_support} in Internal Support.
        People appear here once they have a screening, an assignment or a pairing. Changes save immediately.
      </p>
      <input
        style={{ ...s.input, width: 260, marginBottom: 10 }}
        placeholder="Find a person…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {error && <div style={s.error}>{"⚠"} {error}</div>}
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr><th style={s.th}>Name</th><th style={s.th}>Email</th><th style={s.th}>Team</th></tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id}>
                <td style={{ ...s.td, fontWeight: 600 }}>{a.name}</td>
                <td style={s.td}>{a.email || "—"}</td>
                <td style={s.td}>
                  <select
                    value={a.team}
                    disabled={savingId === a.id}
                    onChange={(e) => changeTeam(a, e.target.value)}
                    style={s.input}
                    aria-label={`Team for ${a.name}`}
                  >
                    {Object.entries(TEAM_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td style={s.td} colSpan={3}>No one yet. Run the import below to bring in past screenings.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PairsSection() {
  const [pairs, setPairs] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ evaluatorName: "", evaluatorEmail: "", agentName: "" });
  const [saving, setSaving] = useState(false);

  const load = () => listEvaluatorPairs().then((d) => setPairs(d.pairs || [])).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    if (!form.evaluatorName.trim() || !form.agentName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createEvaluatorPair(form);
      setForm((f) => ({ ...f, agentName: "" }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(pair) {
    if (!window.confirm(`Stop ${pair.evaluator_name} evaluating ${pair.agent_name}?`)) return;
    try {
      await removeEvaluatorPair(pair.id);
      setPairs((prev) => prev.filter((p) => p.id !== pair.id));
    } catch (err) {
      setError(err.message);
    }
  }

  const byEvaluator = useMemo(() => {
    const map = {};
    pairs.forEach((p) => { (map[p.evaluator_name] = map[p.evaluator_name] || []).push(p); });
    return map;
  }, [pairs]);

  return (
    <div style={s.body}>
      <h2 style={s.h2}>Evaluator pairings</h2>
      <p style={s.hint}>Who screens whom. "Generate This Week's Assignments" picks interactions for each pairing.</p>
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input style={{ ...s.input, flex: "1 1 160px" }} placeholder="Evaluator name" value={form.evaluatorName}
          onChange={(e) => setForm({ ...form, evaluatorName: e.target.value })} />
        <input style={{ ...s.input, flex: "1 1 180px" }} placeholder="Evaluator email" type="email" value={form.evaluatorEmail}
          onChange={(e) => setForm({ ...form, evaluatorEmail: e.target.value })} />
        <input style={{ ...s.input, flex: "1 1 160px" }} placeholder="Agent name (as in CXone)" value={form.agentName}
          onChange={(e) => setForm({ ...form, agentName: e.target.value })} />
        <button type="submit" style={s.btn(true, saving)} disabled={saving}>Add pairing</button>
      </form>
      {error && <div style={s.error}>{"⚠"} {error}</div>}
      {Object.keys(byEvaluator).sort().map((name) => (
        <div key={name} style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.gray, marginBottom: 4 }}>{name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {byEvaluator[name].map((p) => (
              <span key={p.id} style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 10px",
                borderRadius: 14, background: "#FEF3E2", fontSize: 12, color: COLORS.gray,
              }}>
                {p.agent_name}
                <button type="button" onClick={() => remove(p)} aria-label={`Remove ${p.agent_name}`}
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: COLORS.midGray, fontSize: 14 }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}
      {pairs.length === 0 && !error && <div style={{ fontSize: 13, color: COLORS.midGray }}>No pairings yet.</div>}
    </div>
  );
}

function ImportSection({ onImported }) {
  const { instance, accounts } = useMsal();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      let token;
      try {
        token = (await instance.acquireTokenSilent({ ...loginRequest, account: accounts[0] })).accessToken;
      } catch {
        token = (await instance.acquireTokenPopup(loginRequest)).accessToken;
      }
      setResult(await runSharePointImport(token, setProgress));
      onImported && onImported();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
      setProgress("");
    }
  }

  const c = result?.counts;
  return (
    <div style={s.body}>
      <h2 style={s.h2}>Import from SharePoint (one time)</h2>
      <p style={s.hint}>
        Copies every past screening, assignment and evaluator pairing from the old SharePoint lists
        into the QA database. Safe to run again: anything already imported is skipped. Files attached
        in SharePoint stay there.
      </p>
      <button type="button" style={s.btn(true, running)} disabled={running} onClick={run}>
        {running ? "Importing…" : "Import from SharePoint"}
      </button>
      {progress && <div style={{ fontSize: 13, color: COLORS.midGray, marginTop: 8 }}>{progress}</div>}
      {error && <div style={s.error}>{"⚠"} {error}</div>}
      {c && (
        <div style={s.ok}>
          Done. Screenings: {c.screenings.imported} imported, {c.screenings.skipped} skipped ·
          Assignments: {c.assignments.imported} imported, {c.assignments.skipped} skipped ·
          Pairings: {c.pairs.imported} imported, {c.pairs.skipped} skipped.
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  // Remount the lists after an import so new people and pairings show up.
  const [version, setVersion] = useState(0);
  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <h1 style={s.title}>Settings</h1>
          <p style={s.sub}>Managers only · teams, evaluator pairings and the SharePoint import</p>
        </div>
        <TeamsSection key={`t${version}`} />
      </div>
      <div style={s.card}><PairsSection key={`p${version}`} /></div>
      <div style={s.card}><ImportSection onImported={() => setVersion((v) => v + 1)} /></div>
    </div>
  );
}
