import React, { useEffect, useMemo, useState } from "react";
import { COLORS, FONTS } from "../brand";
import { QA_QUESTIONS, CHANNELS } from "../questions";
import {
  qaFetch, listScreenings, listAgents, toRecord, teamLabel, nameKey, defaultTeam,
} from "../qaApi";
import ScreeningDetail from "./ScreeningDetail";

// ─────────────────────────────────────────────────────────────────────────────
// QA Dashboard
//   One filter bar drives everything below it:
//   KPIs (with change vs the previous period) → Overview / Agents / Screenings.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 24 * 3600 * 1000;
const PASS = 80;

const RANGES = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom…" },
];

const TEAMS = [
  { key: "customer_support", label: "Customer Support" },
  { key: "internal_support", label: "Internal Support" },
  { key: "all", label: "All Teams" },
];

const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "agents", label: "Agents" },
  { key: "screenings", label: "Screenings" },
];

// ── Small UI pieces ─────────────────────────────────────────────────────────

const ui = {
  page: { minHeight: "100vh", background: COLORS.offWhite, padding: "18px 16px 40px", fontFamily: FONTS.body, fontSize: 13, color: COLORS.gray },
  wrap: { maxWidth: 1180, margin: "0 auto" },
  card: { background: COLORS.white, border: `1px solid ${COLORS.lightGray}`, borderRadius: 10, padding: 16 },
  h1: { margin: 0, fontSize: 20, fontWeight: 700, fontFamily: FONTS.heading, color: COLORS.charcoal },
  h2: { margin: "0 0 10px", fontSize: 14, fontWeight: 700, fontFamily: FONTS.heading, color: COLORS.charcoal },
  muted: { color: COLORS.midGray, fontSize: 12 },
  select: {
    height: 32, padding: "0 8px", border: `1px solid ${COLORS.lightGray}`, borderRadius: 6,
    background: COLORS.white, fontSize: 12.5, fontFamily: FONTS.body, color: COLORS.gray, minWidth: 0,
  },
  th: {
    textAlign: "left", padding: "7px 10px", fontSize: 11, fontWeight: 600, color: COLORS.midGray,
    textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${COLORS.lightGray}`,
    whiteSpace: "nowrap", background: COLORS.white, position: "sticky", top: 0,
  },
  td: { padding: "7px 10px", borderBottom: `1px solid #F1F1F1`, fontSize: 12.5, whiteSpace: "nowrap" },
  num: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
};

function Segmented({ options, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} style={{
      display: "inline-flex", background: "#F1F1F1", borderRadius: 8, padding: 2, gap: 2,
    }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.key)}
            style={{
              border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12.5,
              fontWeight: 600, fontFamily: FONTS.heading, whiteSpace: "nowrap",
              background: on ? COLORS.white : "transparent", color: on ? COLORS.charcoal : COLORS.midGray,
              boxShadow: on ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function scoreColor(pct) {
  if (pct == null) return COLORS.midGray;
  return pct >= PASS ? "#3C8A1E" : pct >= 70 ? "#B26A00" : COLORS.fail;
}

function ResultBadge({ result }) {
  const pass = result === "Pass";
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
      background: pass ? COLORS.passBg : COLORS.failBg, color: pass ? "#3C8A1E" : COLORS.fail,
    }}>
      {pass ? "✓ Pass" : "✕ Fail"}
    </span>
  );
}

function Delta({ now, before, unit = "", invert = false }) {
  if (now == null || before == null) return null;
  const d = Math.round(now - before);
  if (d === 0) return <span style={ui.muted}>no change</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, color: good ? "#3C8A1E" : COLORS.fail }}>
      {d > 0 ? "▲" : "▼"} {Math.abs(d)}{unit} <span style={{ ...ui.muted, fontWeight: 400 }}>vs previous</span>
    </span>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div style={{ ...ui.card, padding: "12px 14px", flex: "1 1 160px", minWidth: 0 }}>
      <div style={{ ...ui.muted, textTransform: "uppercase", letterSpacing: 0.4, fontSize: 11, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: FONTS.heading, color: COLORS.charcoal, margin: "2px 0" }}>{value}</div>
      <div style={{ minHeight: 16 }}>{sub}</div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const isoDay = (d) => d.toISOString().slice(0, 10);
const fmtDay = (d) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

function weekStart(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(x.getTime() - dow * DAY);
}

function rangeBounds(key, custom) {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + DAY);
  const r = RANGES.find((x) => x.key === key);
  if (r?.days) return { start: new Date(end.getTime() - r.days * DAY), end };
  if (key === "month") return { start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), end };
  if (key === "custom" && custom.from && custom.to) {
    return { start: new Date(`${custom.from}T00:00:00Z`), end: new Date(new Date(`${custom.to}T00:00:00Z`).getTime() + DAY) };
  }
  return { start: null, end: null }; // all time
}

function summarize(rows) {
  if (!rows.length) return { n: 0, avg: null, passRate: null, agents: 0 };
  const avg = rows.reduce((s, r) => s + r.scorePercent, 0) / rows.length;
  const pass = rows.filter((r) => r.passFail === "Pass").length;
  return { n: rows.length, avg, passRate: (pass / rows.length) * 100, agents: new Set(rows.map((r) => r.agentName)).size };
}

function missedQuestions(rows) {
  return QA_QUESTIONS.map((q) => {
    let no = 0, scored = 0;
    rows.forEach((r) => {
      const a = r.answers?.[q.field];
      if (a === "Yes" || a === "No") scored += 1;
      if (a === "No") no += 1;
    });
    return { field: q.field, label: q.label, no, scored, rate: scored ? (no / scored) * 100 : 0 };
  }).filter((x) => x.scored > 0 && x.no > 0).sort((a, b) => b.rate - a.rate || b.no - a.no);
}

function toCsv(rows, teamOn) {
  const head = ["Date", "Agent", ...(teamOn ? ["Team"] : []), "Channel", "Contact ID", "Score %", "Result", "Evaluator",
    ...QA_QUESTIONS.map((q) => q.label), "Feedback"];
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => [
    r.date ? isoDay(r.date) : "", r.agentName, ...(teamOn ? [teamLabel(r.team)] : []), r.channel, r.contactId,
    r.scorePercent, r.passFail, r.evaluatorName, ...QA_QUESTIONS.map((q) => r.answers?.[q.field] || ""), r.suggestions,
  ].map(esc).join(","));
  return [head.map(esc).join(","), ...lines].join("\n");
}

function downloadCsv(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Charts (single series, one hue; hover shows the exact values) ───────────

function WeeklyTrend({ rows }) {
  const [hover, setHover] = useState(null);
  const weeks = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      if (!r.date) return;
      const k = isoDay(weekStart(r.date));
      const w = map.get(k) || { week: k, sum: 0, n: 0, pass: 0 };
      w.sum += r.scorePercent; w.n += 1; if (r.passFail === "Pass") w.pass += 1;
      map.set(k, w);
    });
    return [...map.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-16)
      .map((w) => ({ ...w, avg: w.sum / w.n }));
  }, [rows]);

  if (weeks.length === 0) return <div style={ui.muted}>No screenings in this period.</div>;
  // Drawn close to its on-screen size so the 10–11px labels stay readable.
  const W = 380, H = 190, L = 34, B = 22, T = 10;
  const bw = Math.max(6, Math.min(30, (W - L) / weeks.length - 6));
  const y = (v) => T + (H - T - B) * (1 - v / 100);
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Average score by week" style={{ display: "block" }}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="#EEE" />
            <text x={L - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill={COLORS.midGray}>{v}%</text>
          </g>
        ))}
        <line x1={L} x2={W} y1={y(PASS)} y2={y(PASS)} stroke={COLORS.midGray} strokeDasharray="4 3" />
        <text x={W - 2} y={y(PASS) - 4} fontSize="11" textAnchor="end" fill={COLORS.midGray}>pass 80%</text>
        {weeks.map((w, i) => {
          const slot = (W - L) / weeks.length;
          const x = L + i * slot + (slot - bw) / 2;
          const top = y(w.avg);
          return (
            <g key={w.week} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + i * slot} y={T} width={slot} height={H - T - B} fill="transparent" />
              <path
                d={`M${x},${y(0)} V${top + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${y(0)} Z`}
                fill={COLORS.sky} opacity={hover == null || hover === i ? 1 : 0.45}
              />
              {(i === 0 || i === weeks.length - 1 || weeks.length <= 8) && (
                <text x={x + bw / 2} y={H - 6} fontSize="11" textAnchor="middle" fill={COLORS.midGray}>
                  {new Date(`${w.week}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div style={{
          position: "absolute", top: 0, left: `${((L + (hover + 0.5) * ((W - L) / weeks.length)) / W) * 100}%`,
          transform: "translateX(-50%)", background: COLORS.charcoal, color: COLORS.white, borderRadius: 6,
          padding: "6px 9px", fontSize: 11.5, pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          Week of {weeks[hover].week} · avg {Math.round(weeks[hover].avg)}% · {weeks[hover].n} screened · {weeks[hover].pass} passed
        </div>
      )}
    </div>
  );
}

function MissedQuestions({ rows, limit = 8 }) {
  const items = useMemo(() => missedQuestions(rows).slice(0, limit), [rows, limit]);
  if (!items.length) return <div style={ui.muted}>No missed questions in this period. 🎉</div>;
  return (
    <div>
      {items.map((q) => (
        <div key={q.field} title={`${q.no} of ${q.scored} scored answers were "No"`}
          style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1.2fr) 2fr 70px", alignItems: "center", gap: 10, padding: "4px 0" }}>
          <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.label}</span>
          <div style={{ height: 8, background: "#F1F1F1", borderRadius: 4 }}>
            <div style={{ width: `${Math.max(3, q.rate)}%`, height: "100%", background: COLORS.orange, borderRadius: 4 }} />
          </div>
          <span style={{ ...ui.num, fontSize: 12 }}>
            <strong>{Math.round(q.rate)}%</strong> <span style={ui.muted}>({q.no})</span>
          </span>
        </div>
      ))}
      <div style={{ ...ui.muted, marginTop: 6 }}>Share of scored answers marked “No”. N/A is not counted.</div>
    </div>
  );
}

function BreakdownTable({ rows, by, label }) {
  const groups = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const k = r[by] || "—";
      const g = map.get(k) || [];
      g.push(r);
      map.set(k, g);
    });
    return [...map.entries()].map(([k, g]) => ({ k, ...summarize(g) })).sort((a, b) => b.n - a.n);
  }, [rows, by]);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={ui.th}>{label}</th>
          <th style={{ ...ui.th, ...ui.num }}>Screened</th>
          <th style={{ ...ui.th, ...ui.num }}>Avg</th>
          <th style={{ ...ui.th, ...ui.num }}>Pass rate</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.k}>
            <td style={ui.td}>{g.k}</td>
            <td style={{ ...ui.td, ...ui.num }}>{g.n}</td>
            <td style={{ ...ui.td, ...ui.num, color: scoreColor(g.avg), fontWeight: 600 }}>{Math.round(g.avg)}%</td>
            <td style={{ ...ui.td, ...ui.num }}>{Math.round(g.passRate)}%</td>
          </tr>
        ))}
        {!groups.length && <tr><td style={ui.td} colSpan={4}><span style={ui.muted}>Nothing to show.</span></td></tr>}
      </tbody>
    </table>
  );
}

// ── Sortable table header ───────────────────────────────────────────────────

function SortTh({ col, sort, setSort, children, right }) {
  const on = sort.col === col;
  return (
    <th
      style={{ ...ui.th, ...(right ? ui.num : {}), cursor: "pointer", color: on ? COLORS.charcoal : COLORS.midGray }}
      aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      onClick={() => setSort({ col, dir: on ? -sort.dir : (right ? -1 : 1) })}
    >
      {children}{on ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );
}

function sortRows(rows, sort, get) {
  return [...rows].sort((a, b) => {
    const x = get(a, sort.col), y = get(b, sort.col);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
}

// ── CXone activity (agent contacts / handle time / unavailable) ─────────────

async function fetchJson(path) {
  const res = await qaFetch(path);
  if (!res.ok) {
    if (res.status === 502 || res.status === 504) throw new Error(`CXone timed out (${res.status}). Try a shorter period.`);
    throw new Error(`CXone activity unavailable (${res.status})`);
  }
  return res.json();
}

function fmtDuration(sec) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Dashboard({ refreshKey = 0, onEdit }) {
  const [records, setRecords] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [teamByName, setTeamByName] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [team, setTeam] = useState("customer_support");
  const [range, setRange] = useState("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [channel, setChannel] = useState("All");
  const [agent, setAgent] = useState("All");
  const [evaluator, setEvaluator] = useState("All");
  const [result, setResult] = useState("All");
  const [search, setSearch] = useState("");
  const [includeRemoved, setIncludeRemoved] = useState(false);

  const [view, setView] = useState("overview");
  const [openId, setOpenId] = useState(null);
  const [page, setPage] = useState(0);
  const [screenSort, setScreenSort] = useState({ col: "date", dir: -1 });
  const [agentSort, setAgentSort] = useState({ col: "n", dir: -1 });

  // CXone activity for the Agents view (loaded on demand)
  const [activity, setActivity] = useState(null);
  const [activityState, setActivityState] = useState({ loading: false, error: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [data, agentData] = await Promise.all([
          listScreenings(),
          listAgents().catch(() => ({ agents: [] })),
        ]);
        if (cancelled) return;
        setRecords((data.screenings || []).map(toRecord));
        setTruncated(!!data.truncated);
        setTeamByName(Object.fromEntries((agentData.agents || []).map((a) => [nameKey(a.name), a.team])));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const teamOf = useMemo(() => (name) => teamByName[nameKey(name)] || defaultTeam(name), [teamByName]);
  const bounds = useMemo(() => rangeBounds(range, custom), [range, custom]);

  // Team + period only (feeds the agent/evaluator pickers and "previous period")
  const teamRows = useMemo(
    () => records.filter((r) => (team === "all" || r.team === team) && (includeRemoved || r.agentActive)),
    [records, team, includeRemoved]
  );
  const inRange = (r, start, end) => !start || (r.date && r.date >= start && r.date < end);

  const applyFilters = useMemo(() => (rows) => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (channel === "All" || r.channel === channel)
      && (agent === "All" || r.agentName === agent)
      && (evaluator === "All" || r.evaluatorName === evaluator)
      && (result === "All" || r.passFail === result)
      && (!q || r.agentName.toLowerCase().includes(q) || String(r.contactId).toLowerCase().includes(q)
        || r.evaluatorName.toLowerCase().includes(q))
    );
  }, [channel, agent, evaluator, result, search]);

  const filtered = useMemo(
    () => applyFilters(teamRows.filter((r) => inRange(r, bounds.start, bounds.end))),
    [teamRows, bounds, applyFilters]
  );
  const previous = useMemo(() => {
    if (!bounds.start) return null;
    const len = bounds.end - bounds.start;
    const pStart = new Date(bounds.start.getTime() - len);
    return applyFilters(teamRows.filter((r) => inRange(r, pStart, bounds.start)));
  }, [teamRows, bounds, applyFilters]);

  const agentsList = useMemo(() => [...new Set(teamRows.map((r) => r.agentName).filter(Boolean))].sort(), [teamRows]);
  const evaluatorsList = useMemo(() => [...new Set(teamRows.map((r) => r.evaluatorName).filter(Boolean))].sort(), [teamRows]);

  const now = summarize(filtered);
  const before = previous ? summarize(previous) : null;

  // Agents view rows
  const agentRows = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const g = map.get(r.agentName) || [];
      g.push(r);
      map.set(r.agentName, g);
    });
    return [...map.entries()].map(([name, g]) => {
      const sorted = [...g].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
      const s = summarize(g);
      const last = sorted[sorted.length - 1];
      const missed = missedQuestions(g)[0];
      const act = activity?.[nameKey(name)];
      return {
        name, team: teamOf(name), n: s.n, avg: s.avg, passRate: s.passRate,
        lastDate: last?.date || null, lastScore: last?.scorePercent ?? null,
        topMiss: missed ? missed.label : "", contacts: act?.totalContacts ?? null,
        aht: act?.avgHandleSeconds ?? null, unavailable: act?.unavailableSeconds ?? null,
      };
    });
  }, [filtered, activity, teamOf]);

  async function loadActivity() {
    // CXone queries are capped at 31 days to stay inside the service timeout.
    const end = bounds.end ? new Date(bounds.end.getTime() - DAY) : new Date();
    let start = bounds.start || new Date(end.getTime() - 30 * DAY);
    if (end - start > 31 * DAY) start = new Date(end.getTime() - 31 * DAY);
    setActivityState({ loading: true, error: null, start, end });
    try {
      const [prod, unav] = await Promise.all([
        fetchJson(`/api/metrics/productivity?startDate=${isoDay(start)}&endDate=${isoDay(end)}`),
        fetchJson(`/api/metrics/unavailable?startDate=${isoDay(start)}&endDate=${isoDay(end)}`).catch(() => ({ agents: [] })),
      ]);
      const map = {};
      (prod.agents || []).forEach((p) => { map[nameKey(p.agentName)] = { ...p }; });
      (unav.agents || []).forEach((u) => {
        const k = nameKey(u.agentName);
        map[k] = { ...(map[k] || {}), unavailableSeconds: u.unavailableSeconds };
      });
      setActivity(map);
      setActivityState({ loading: false, error: null, start, end });
    } catch (e) {
      setActivityState({ loading: false, error: e.message, start, end });
    }
  }

  // Reset paging when filters change
  useEffect(() => { setPage(0); }, [filtered]);

  const sortedScreenings = useMemo(() => sortRows(filtered, screenSort, (r, c) => ({
    date: r.date?.getTime(), agent: r.agentName, channel: r.channel, score: r.scorePercent,
    result: r.passFail, evaluator: r.evaluatorName, team: r.team,
  }[c])), [filtered, screenSort]);
  const sortedAgents = useMemo(() => sortRows(agentRows, agentSort, (r, c) => (
    c === "lastDate" ? r.lastDate?.getTime() : r[c]
  )), [agentRows, agentSort]);

  const PAGE = 25;
  const pageRows = sortedScreenings.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(sortedScreenings.length / PAGE));
  const filtersActive = channel !== "All" || agent !== "All" || evaluator !== "All" || result !== "All" || search;

  function clearFilters() {
    setChannel("All"); setAgent("All"); setEvaluator("All"); setResult("All"); setSearch("");
  }

  function focusAgent(name) {
    setAgent(name);
    setView("screenings");
  }

  const periodLabel = range === "custom" && custom.from && custom.to
    ? `${custom.from} – ${custom.to}` : RANGES.find((r) => r.key === range)?.label;

  return (
    <div className="qa-page" style={ui.page}>
      <div style={ui.wrap}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <h1 style={ui.h1}>QA Dashboard</h1>
            <div style={ui.muted}>{teamLabel(team === "all" ? "" : team) === "Other" ? "All teams" : teamLabel(team)} · {periodLabel}</div>
          </div>
          <Segmented label="Team" options={TEAMS} value={team}
            onChange={(t) => { setTeam(t); setAgent("All"); setEvaluator("All"); }} />
        </div>

        {/* Filter bar */}
        <div style={{ ...ui.card, padding: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <select aria-label="Period" style={ui.select} value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          {range === "custom" && (
            <>
              <input aria-label="From" type="date" style={ui.select} value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              <span style={ui.muted}>to</span>
              <input aria-label="To" type="date" style={ui.select} value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </>
          )}
          <select aria-label="Channel" style={ui.select} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="All">All channels</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Agent" style={{ ...ui.select, maxWidth: 190 }} value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="All">All agents</option>
            {agentsList.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Evaluator" style={{ ...ui.select, maxWidth: 190 }} value={evaluator} onChange={(e) => setEvaluator(e.target.value)}>
            <option value="All">All evaluators</option>
            {evaluatorsList.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Result" style={ui.select} value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="All">Pass & fail</option>
            <option value="Pass">Passed only</option>
            <option value="Fail">Failed only</option>
          </select>
          <input aria-label="Search" type="search" placeholder="Search agent, evaluator or contact ID"
            style={{ ...ui.select, flex: "1 1 200px", minWidth: 160 }} value={search} onChange={(e) => setSearch(e.target.value)} />
          <label style={{ ...ui.muted, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
            <input type="checkbox" checked={includeRemoved} onChange={(e) => setIncludeRemoved(e.target.checked)} />
            Include removed people
          </label>
          {filtersActive && (
            <button type="button" onClick={clearFilters}
              style={{ ...ui.select, cursor: "pointer", color: COLORS.orange, borderColor: "transparent", background: "transparent", fontWeight: 600 }}>
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ ...ui.card, textAlign: "center", color: COLORS.midGray, padding: 40 }}>Loading screenings…</div>
        ) : error ? (
          <div style={{ ...ui.card, color: COLORS.fail }}>{"⚠"} {error}</div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <Kpi label="Screenings" value={now.n}
                sub={before && <Delta now={now.n} before={before.n} />} />
              <Kpi label="Average score" value={now.avg == null ? "—" : `${Math.round(now.avg)}%`}
                sub={before && before.n > 0 && now.n > 0 && <Delta now={now.avg} before={before.avg} unit=" pts" />} />
              <Kpi label="Pass rate" value={now.passRate == null ? "—" : `${Math.round(now.passRate)}%`}
                sub={before && before.n > 0 && now.n > 0 && <Delta now={now.passRate} before={before.passRate} unit=" pts" />} />
              <Kpi label="Agents reviewed" value={now.agents}
                sub={<span style={ui.muted}>{agentsList.length} screened in {teamLabel(team) === "Other" ? "all teams" : "this team"} overall</span>} />
            </div>

            {/* View switcher + export */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <Segmented label="View" options={VIEWS} value={view} onChange={setView} />
              <button type="button"
                onClick={() => downloadCsv(`qa-screenings-${isoDay(new Date())}.csv`, toCsv(sortedScreenings, team === "all"))}
                disabled={!filtered.length}
                style={{ ...ui.select, cursor: filtered.length ? "pointer" : "not-allowed", fontWeight: 600 }}>
                Export CSV ({filtered.length})
              </button>
            </div>

            {truncated && <div style={{ ...ui.muted, marginBottom: 8 }}>Only the newest 5,000 screenings are loaded.</div>}

            {view === "overview" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
                <div style={ui.card}>
                  <h2 style={ui.h2}>Average score by week</h2>
                  <WeeklyTrend rows={filtered} />
                </div>
                <div style={ui.card}>
                  <h2 style={ui.h2}>Most-missed questions</h2>
                  <MissedQuestions rows={filtered} />
                </div>
                <div style={ui.card}>
                  <h2 style={ui.h2}>By channel</h2>
                  <BreakdownTable rows={filtered} by="channel" label="Channel" />
                </div>
                <div style={ui.card}>
                  <h2 style={ui.h2}>By evaluator</h2>
                  <BreakdownTable rows={filtered} by="evaluatorName" label="Evaluator" />
                </div>
              </div>
            )}

            {view === "agents" && (
              <div style={ui.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <h2 style={{ ...ui.h2, margin: 0 }}>Agents · {agentRows.length}</h2>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {activityState.error && <span style={{ color: COLORS.fail, fontSize: 12 }}>{activityState.error}</span>}
                    {activity && activityState.start && (
                      <span style={ui.muted}>CXone activity {isoDay(activityState.start)} – {isoDay(activityState.end)}</span>
                    )}
                    <button type="button" onClick={loadActivity} disabled={activityState.loading}
                      style={{ ...ui.select, cursor: "pointer", fontWeight: 600 }}>
                      {activityState.loading ? "Loading CXone…" : activity ? "Refresh CXone activity" : "Add CXone activity"}
                    </button>
                  </div>
                </div>
                <div className="qa-scroll-x">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <SortTh col="name" sort={agentSort} setSort={setAgentSort}>Agent</SortTh>
                        {team === "all" && <SortTh col="team" sort={agentSort} setSort={setAgentSort}>Team</SortTh>}
                        <SortTh col="n" sort={agentSort} setSort={setAgentSort} right>Screened</SortTh>
                        <SortTh col="avg" sort={agentSort} setSort={setAgentSort} right>Avg</SortTh>
                        <SortTh col="passRate" sort={agentSort} setSort={setAgentSort} right>Pass rate</SortTh>
                        <SortTh col="lastDate" sort={agentSort} setSort={setAgentSort}>Last screened</SortTh>
                        <th style={ui.th}>Most missed</th>
                        {activity && <SortTh col="contacts" sort={agentSort} setSort={setAgentSort} right>Contacts</SortTh>}
                        {activity && <SortTh col="aht" sort={agentSort} setSort={setAgentSort} right>Avg handle</SortTh>}
                        {activity && <SortTh col="unavailable" sort={agentSort} setSort={setAgentSort} right>Unavailable</SortTh>}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAgents.map((a) => (
                        <tr key={a.name} className="qa-clickable-row" style={{ cursor: "pointer" }}
                          onClick={() => focusAgent(a.name)} title={`Show ${a.name}'s screenings`}>
                          <td style={{ ...ui.td, fontWeight: 600 }}>{a.name}</td>
                          {team === "all" && <td style={ui.td}>{teamLabel(a.team)}</td>}
                          <td style={{ ...ui.td, ...ui.num }}>{a.n}</td>
                          <td style={{ ...ui.td, ...ui.num, fontWeight: 600, color: scoreColor(a.avg) }}>{Math.round(a.avg)}%</td>
                          <td style={{ ...ui.td, ...ui.num }}>{Math.round(a.passRate)}%</td>
                          <td style={ui.td}>
                            {fmtDay(a.lastDate)} <span style={{ color: scoreColor(a.lastScore) }}>({a.lastScore}%)</span>
                          </td>
                          <td style={{ ...ui.td, color: COLORS.midGray }}>{a.topMiss || "—"}</td>
                          {activity && <td style={{ ...ui.td, ...ui.num }}>{a.contacts ?? "—"}</td>}
                          {activity && <td style={{ ...ui.td, ...ui.num }}>{fmtDuration(a.aht)}</td>}
                          {activity && <td style={{ ...ui.td, ...ui.num }}>{fmtDuration(a.unavailable)}</td>}
                        </tr>
                      ))}
                      {!agentRows.length && (
                        <tr><td style={ui.td} colSpan={9}><span style={ui.muted}>No screenings match these filters.</span></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === "screenings" && (
              <div style={ui.card}>
                <div className="qa-scroll-x">
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <SortTh col="date" sort={screenSort} setSort={setScreenSort}>Date</SortTh>
                        <SortTh col="agent" sort={screenSort} setSort={setScreenSort}>Agent</SortTh>
                        {team === "all" && <SortTh col="team" sort={screenSort} setSort={setScreenSort}>Team</SortTh>}
                        <SortTh col="channel" sort={screenSort} setSort={setScreenSort}>Channel</SortTh>
                        <SortTh col="score" sort={screenSort} setSort={setScreenSort} right>Score</SortTh>
                        <SortTh col="result" sort={screenSort} setSort={setScreenSort}>Result</SortTh>
                        <SortTh col="evaluator" sort={screenSort} setSort={setScreenSort}>Evaluator</SortTh>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => (
                        <tr key={r.id} className="qa-clickable-row" style={{ cursor: "pointer" }}
                          onClick={() => setOpenId(r.id)} title="Open screening details">
                          <td style={ui.td}>{fmtDay(r.date)}</td>
                          <td style={{ ...ui.td, fontWeight: 600 }}>{r.agentName}</td>
                          {team === "all" && <td style={ui.td}>{teamLabel(r.team)}</td>}
                          <td style={ui.td}>{r.channel}</td>
                          <td style={{ ...ui.td, ...ui.num, fontWeight: 700, color: scoreColor(r.scorePercent) }}>{r.scorePercent}%</td>
                          <td style={ui.td}><ResultBadge result={r.passFail} /></td>
                          <td style={ui.td}>
                            {r.evaluatorName}
                            {r.edited && <span style={{ marginLeft: 6, fontSize: 11, color: COLORS.sky }}>edited</span>}
                          </td>
                        </tr>
                      ))}
                      {!pageRows.length && (
                        <tr><td style={ui.td} colSpan={7}><span style={ui.muted}>No screenings match these filters.</span></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {sortedScreenings.length > PAGE && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                    <span style={ui.muted}>
                      {page * PAGE + 1}–{Math.min((page + 1) * PAGE, sortedScreenings.length)} of {sortedScreenings.length}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" style={{ ...ui.select, cursor: "pointer" }} disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}>Previous</button>
                      <button type="button" style={{ ...ui.select, cursor: "pointer" }} disabled={page >= pages - 1}
                        onClick={() => setPage((p) => p + 1)}>Next</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {openId && (
        <ScreeningDetail
          screeningId={openId}
          onClose={() => setOpenId(null)}
          onEdit={(s) => { setOpenId(null); onEdit && onEdit(s); }}
        />
      )}
    </div>
  );
}
