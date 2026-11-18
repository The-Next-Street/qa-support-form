import React, { useEffect, useMemo, useState } from "react";
import { COLORS, FONTS } from "../brand";
import { qaFetch } from "../qaApi";
import ScreeningDetail from "./ScreeningDetail";
import { useQaData, inTeam } from "./useQaData";
import {
  layout, PageHeader, Section, FilterBar, StatTile, Button, Dash, Notice, Loading,
  table, SortHeader, ChannelTag, ResultBadge, fmtDate, scoreColor,
  defaultFilters, inRange, rangeDays, rangeLabel,
} from "./ui";

// Overview: headline numbers, what needs attention, and per-agent performance
// (CXone productivity + QA quality) for the chosen team and dates.

const MAX_METRIC_DAYS = 31; // CXone metrics time out on longer ranges

async function fetchJson(path, what) {
  const res = await qaFetch(path);
  if (!res.ok) {
    if (res.status === 502 || res.status === 504) {
      throw new Error(`${what} timed out (${res.status}). Try a shorter date range.`);
    }
    throw new Error(`${what} failed (${res.status})`);
  }
  return res.json();
}

function formatSeconds(sec) {
  if (!sec) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const CHANNEL_NAMES = { C: "Chat", E: "Email", P: "Phone", S: "SMS" };

function emptyAgent(name) {
  return {
    agentName: name, totalContacts: 0, byChannel: {}, totalHandleSeconds: 0, avgHandleSeconds: 0,
    refusedCount: 0, unavailableSeconds: 0, screenings: 0, avgScore: null, passRate: null,
    screeningRecords: [],
  };
}

export default function Dashboard({ refreshKey = 0, onEdit, filters: filtersProp, onFiltersChange, onOpenScreenings }) {
  const [localFilters, setLocalFilters] = useState(defaultFilters);
  const filters = filtersProp || localFilters;
  const setFilters = onFiltersChange || setLocalFilters;

  const { records, truncated, teamOf, loading, error } = useQaData(refreshKey);
  const [openScreeningId, setOpenScreeningId] = useState(null);
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [sort, setSort] = useState({ key: "totalContacts", dir: "desc" });

  // CXone metrics, only for ranges the backend can handle
  const metricsAllowed = rangeDays(filters) <= MAX_METRIC_DAYS;
  const [productivity, setProductivity] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);

  useEffect(() => {
    if (!metricsAllowed || !filters.start || !filters.end) {
      setProductivity([]);
      setUnavailable([]);
      setMetricsError(null);
      return;
    }
    let alive = true;
    setMetricsLoading(true);
    setMetricsError(null);
    const q = `startDate=${filters.start}&endDate=${filters.end}`;
    Promise.all([
      fetchJson(`/api/metrics/productivity?${q}`, "Contact metrics"),
      fetchJson(`/api/metrics/unavailable?${q}`, "Unavailable time"),
    ])
      .then(([prod, unav]) => {
        if (!alive) return;
        setProductivity(prod.agents || []);
        setUnavailable(unav.agents || []);
      })
      .catch((err) => alive && setMetricsError(err.message))
      .finally(() => alive && setMetricsLoading(false));
    return () => { alive = false; };
  }, [filters.start, filters.end, metricsAllowed]);

  // Screenings for this team and date range
  const scoped = useMemo(
    () => records.filter((r) => inTeam(r.team, filters.team) && inRange(r.date, filters)),
    [records, filters]
  );

  const stats = useMemo(() => {
    const total = scoped.length;
    const channels = {};
    scoped.forEach((r) => { channels[r.channel] = (channels[r.channel] || 0) + 1; });
    if (!total) return { total, avgScore: null, passRate: null, agents: 0, fails: 0, channels };
    const fails = scoped.filter((r) => r.passFail !== "Pass").length;
    return {
      total,
      avgScore: Math.round(scoped.reduce((sum, r) => sum + r.scorePercent, 0) / total),
      passRate: Math.round(((total - fails) / total) * 100),
      agents: new Set(scoped.map((r) => r.agentName).filter(Boolean)).size,
      fails,
      channels,
    };
  }, [scoped]);

  // One row per agent: CXone productivity + unavailable time + QA quality
  const agentRows = useMemo(() => {
    const byName = {};
    const get = (name) => (byName[name] = byName[name] || emptyAgent(name));
    productivity.forEach((p) => Object.assign(get(p.agentName), {
      totalContacts: p.totalContacts || 0,
      byChannel: p.byChannel || {},
      totalHandleSeconds: p.totalHandleSeconds || 0,
      avgHandleSeconds: p.avgHandleSeconds || 0,
      refusedCount: p.refusedCount || 0,
    }));
    unavailable.forEach((u) => { get(u.agentName).unavailableSeconds = u.unavailableSeconds || 0; });
    scoped.forEach((r) => { if (r.agentName) get(r.agentName).screeningRecords.push(r); });

    Object.values(byName).forEach((a) => {
      const n = a.screeningRecords.length;
      a.screenings = n;
      if (n) {
        a.avgScore = Math.round(a.screeningRecords.reduce((s, r) => s + r.scorePercent, 0) / n);
        a.passRate = Math.round((a.screeningRecords.filter((r) => r.passFail === "Pass").length / n) * 100);
      }
      a.screeningRecords.sort((x, y) => (y.date?.getTime() || 0) - (x.date?.getTime() || 0));
    });

    const dir = sort.dir === "desc" ? -1 : 1;
    return Object.values(byName)
      .filter((a) => inTeam(teamOf(a.agentName), filters.team))
      .sort((a, b) => {
        if (sort.key === "agentName") return dir * a.agentName.localeCompare(b.agentName);
        const av = a[sort.key] ?? -1;
        const bv = b[sort.key] ?? -1;
        return av === bv ? a.agentName.localeCompare(b.agentName) : dir * (av - bv);
      });
  }, [productivity, unavailable, scoped, teamOf, filters.team, sort]);

  const recentFails = useMemo(
    () => scoped.filter((r) => r.passFail !== "Pass")
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
      .slice(0, 5),
    [scoped]
  );
  const lowestAgents = useMemo(
    () => agentRows.filter((a) => a.screenings > 0 && a.avgScore < 80)
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 5),
    [agentRows]
  );

  const showMetricCols = metricsAllowed && !metricsError;
  const colCount = showMetricCols ? 9 : 5;

  return (
    <div style={layout.page}>
      <div style={layout.inner}>
        <PageHeader
          title="Dashboard"
          subtitle={`QA results and agent performance · ${rangeLabel(filters)}`}
          actions={onOpenScreenings && (
            <Button variant="secondary" onClick={() => onOpenScreenings({})}>All screenings</Button>
          )}
        />

        <FilterBar filters={filters} onChange={(f) => { setFilters(f); setExpandedAgent(null); }} />

        {loading ? (
          <Loading text="Loading screenings…" />
        ) : error ? (
          <Notice tone="error">{"⚠"} {error}</Notice>
        ) : (
          <>
            {records.length === 0 && (
              <Notice tone="warn">
                No QA screenings yet. A manager can import the old SharePoint records under Settings.
                Agent productivity from CXone is shown below.
              </Notice>
            )}
            {truncated && <Notice>Showing the newest 5,000 screenings.</Notice>}

            {/* Headline numbers */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
              <StatTile
                label="Screenings"
                value={stats.total}
                hint={Object.entries(stats.channels).map(([c, n]) => `${c} ${n}`).join(" · ") || "None in this range"}
              />
              <StatTile
                label="Average score"
                value={stats.avgScore == null ? "—" : `${stats.avgScore}%`}
                color={scoreColor(stats.avgScore)}
              />
              <StatTile
                label="Pass rate"
                value={stats.passRate == null ? "—" : `${stats.passRate}%`}
                color={scoreColor(stats.passRate)}
                hint={stats.total ? `${stats.fails} failed` : null}
              />
              <StatTile label="Agents reviewed" value={stats.agents} />
            </div>

            {/* Needs attention */}
            {(recentFails.length > 0 || lowestAgents.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
                <Section
                  title="Recent failed screenings"
                  right={onOpenScreenings && (
                    <Button variant="link" onClick={() => onOpenScreenings({ result: "Fail" })}>View all fails →</Button>
                  )}
                  flush
                >
                  {recentFails.length === 0 ? (
                    <div style={{ padding: "16px 24px", fontSize: 13, color: COLORS.midGray }}>No fails in this range.</div>
                  ) : recentFails.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setOpenScreeningId(r.id)}
                      style={rowButton}
                    >
                      <span style={{ fontWeight: 600 }}>{r.agentName}</span>
                      <span style={{ color: COLORS.midGray, fontSize: 12 }}>{fmtDate(r.date)} · {r.channel}</span>
                      <span style={{ marginLeft: "auto", fontWeight: 700, color: scoreColor(r.scorePercent) }}>{r.scorePercent}%</span>
                    </button>
                  ))}
                </Section>
                <Section title="Lowest average scores" subtitle="Agents averaging under 80%" flush>
                  {lowestAgents.length === 0 ? (
                    <div style={{ padding: "16px 24px", fontSize: 13, color: COLORS.midGray }}>Every agent is averaging 80% or more.</div>
                  ) : lowestAgents.map((a) => (
                    <button
                      key={a.agentName}
                      type="button"
                      onClick={() => {
                        setExpandedAgent(a.agentName);
                        setTimeout(() => document.getElementById(agentRowId(a.agentName))
                          ?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 50);
                      }}
                      style={rowButton}
                    >
                      <span style={{ fontWeight: 600 }}>{a.agentName}</span>
                      <span style={{ color: COLORS.midGray, fontSize: 12 }}>
                        {a.screenings} screening{a.screenings === 1 ? "" : "s"} · {a.passRate}% pass
                      </span>
                      <span style={{ marginLeft: "auto", fontWeight: 700, color: scoreColor(a.avgScore) }}>{a.avgScore}%</span>
                    </button>
                  ))}
                </Section>
              </div>
            )}

            {/* Agent performance */}
            <Section
              title="Agent performance"
              subtitle="Contact metrics from CXone with QA results · click an agent for details"
              right={metricsLoading && <span style={{ fontSize: 12, color: COLORS.midGray }}>Loading contact metrics…</span>}
              flush
            >
              {(!metricsAllowed || metricsError) && <div style={{ padding: "12px 24px 0" }}>
                {!metricsAllowed && (
                  <Notice>Contact metrics (contacts, handle time, refusals) are only available for ranges up to {MAX_METRIC_DAYS} days. QA results are shown for the whole range.</Notice>
                )}
                {metricsError && <Notice tone="error">{"⚠"} {metricsError}</Notice>}
              </div>}
              {agentRows.length === 0 && !metricsLoading ? (
                <div style={{ padding: "8px 24px 20px", fontSize: 13, color: COLORS.midGray }}>No agent activity for this team and range.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={table.table}>
                    <thead>
                      <tr>
                        <SortHeader label="Agent" sortKey="agentName" sort={sort} onSort={setSort} />
                        {showMetricCols && <SortHeader label="Contacts" sortKey="totalContacts" sort={sort} onSort={setSort} align="right" />}
                        {showMetricCols && <SortHeader label="Avg handle" sortKey="avgHandleSeconds" sort={sort} onSort={setSort} align="right" />}
                        {showMetricCols && <SortHeader label="Refused" sortKey="refusedCount" sort={sort} onSort={setSort} align="right" />}
                        {showMetricCols && <SortHeader label="Unavailable" sortKey="unavailableSeconds" sort={sort} onSort={setSort} align="right" />}
                        <SortHeader label="Screened" sortKey="screenings" sort={sort} onSort={setSort} align="right" />
                        <SortHeader label="Avg score" sortKey="avgScore" sort={sort} onSort={setSort} align="right" />
                        <SortHeader label="Pass rate" sortKey="passRate" sort={sort} onSort={setSort} align="right" />
                        <th style={{ ...table.th, width: 28 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {agentRows.map((a) => {
                        const isOpen = expandedAgent === a.agentName;
                        return (
                          <React.Fragment key={a.agentName}>
                            <tr
                              id={agentRowId(a.agentName)}
                              onClick={() => setExpandedAgent(isOpen ? null : a.agentName)}
                              style={{ cursor: "pointer", background: isOpen ? "#FFF7ED" : undefined }}
                            >
                              <td style={{ ...table.td, fontWeight: 600 }}>{a.agentName}</td>
                              {showMetricCols && <td style={num}>{a.totalContacts || <Dash />}</td>}
                              {showMetricCols && <td style={num}>{formatSeconds(a.avgHandleSeconds) || <Dash />}</td>}
                              {showMetricCols && (
                                <td style={{ ...num, color: a.refusedCount > 0 ? COLORS.fail : COLORS.gray }}>
                                  {a.refusedCount || <Dash />}
                                </td>
                              )}
                              {showMetricCols && <td style={num}>{formatSeconds(a.unavailableSeconds) || <Dash />}</td>}
                              <td style={num}>{a.screenings || <Dash />}</td>
                              <td style={{ ...num, fontWeight: 700, color: scoreColor(a.avgScore) }}>
                                {a.avgScore == null ? <Dash /> : `${a.avgScore}%`}
                              </td>
                              <td style={{ ...num, fontWeight: 700, color: scoreColor(a.passRate) }}>
                                {a.passRate == null ? <Dash /> : `${a.passRate}%`}
                              </td>
                              <td style={{ ...table.td, color: COLORS.midGray, textAlign: "center" }}>{isOpen ? "▾" : "▸"}</td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td colSpan={colCount} style={{ padding: 0, background: "#FFFBF5", borderBottom: `1px solid ${COLORS.lightGray}` }}>
                                  <AgentDetail
                                    agent={a}
                                    showMetrics={showMetricCols}
                                    onOpenScreening={setOpenScreeningId}
                                    onSeeAll={onOpenScreenings && (() => onOpenScreenings({ agent: a.agentName }))}
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}

        {openScreeningId && (
          <ScreeningDetail
            screeningId={openScreeningId}
            onClose={() => setOpenScreeningId(null)}
            onEdit={(screening) => { setOpenScreeningId(null); onEdit && onEdit(screening); }}
          />
        )}
      </div>
    </div>
  );
}

const agentRowId = (name) => `agent-${String(name).replace(/[^a-z0-9]+/gi, "-")}`;

const num = { ...table.td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

const rowButton = {
  display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
  padding: "11px 24px", background: "none", border: "none", borderBottom: "1px solid #F0F0F0",
  fontSize: 14, color: COLORS.gray, fontFamily: FONTS.body, cursor: "pointer",
};

// Expanded agent row: channel mix, handle time, their screenings and feedback.
function AgentDetail({ agent: a, showMetrics, onOpenScreening, onSeeAll }) {
  const channels = Object.entries(a.byChannel || {}).filter(([, n]) => n > 0);
  const feedback = a.screeningRecords.filter((r) => r.suggestions);
  return (
    <div style={{ padding: "16px 24px 20px" }}>
      {showMetrics && (channels.length > 0 || a.totalHandleSeconds > 0) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14, fontSize: 13, color: COLORS.midGray }}>
          {channels.map(([ch, n]) => (
            <span key={ch} style={{ background: COLORS.white, border: `1px solid ${COLORS.lightGray}`, borderRadius: 6, padding: "3px 8px" }}>
              {CHANNEL_NAMES[ch[0]] || ch} <strong style={{ color: COLORS.gray }}>{n}</strong>
            </span>
          ))}
          {a.totalHandleSeconds > 0 && <span>· Total handle time <strong style={{ color: COLORS.gray }}>{formatSeconds(a.totalHandleSeconds)}</strong></span>}
        </div>
      )}

      {a.screeningRecords.length === 0 ? (
        <div style={{ fontSize: 13, color: COLORS.midGray }}>No QA screenings for {a.agentName} in this range.</div>
      ) : (
        <>
          <div style={{ background: COLORS.white, border: `1px solid ${COLORS.lightGray}`, borderRadius: 8, overflow: "hidden" }}>
            <table style={{ ...table.table, fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={table.th}>Date</th>
                  <th style={table.th}>Channel</th>
                  <th style={table.th}>Contact ID</th>
                  <th style={table.th}>Evaluator</th>
                  <th style={{ ...table.th, textAlign: "right" }}>Score</th>
                  <th style={{ ...table.th, textAlign: "right" }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {a.screeningRecords.slice(0, 10).map((r) => (
                  <tr key={r.id} onClick={() => onOpenScreening(r.id)} style={{ cursor: "pointer" }} title="Open screening">
                    <td style={table.td}>{fmtDate(r.date)}</td>
                    <td style={table.td}><ChannelTag channel={r.channel} /></td>
                    <td style={{ ...table.td, fontFamily: "monospace", fontSize: 12 }}>{r.contactId || <Dash />}</td>
                    <td style={table.td}>{r.evaluatorName || <Dash />}</td>
                    <td style={{ ...table.td, textAlign: "right", fontWeight: 700, color: scoreColor(r.scorePercent) }}>{r.scorePercent}%</td>
                    <td style={{ ...table.td, textAlign: "right" }}><ResultBadge result={r.passFail} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {feedback.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.midGray, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Feedback
              </div>
              {feedback.slice(0, 5).map((r) => (
                <div key={`${r.id}-fb`} style={{
                  padding: "8px 12px", marginBottom: 6, background: COLORS.white,
                  borderLeft: `3px solid ${COLORS.orange}`, borderRadius: 4, fontSize: 13, color: COLORS.gray,
                }}>
                  <div style={{ fontSize: 11, color: COLORS.midGray, marginBottom: 2 }}>{fmtDate(r.date)} · {r.evaluatorName}</div>
                  {r.suggestions}
                </div>
              ))}
            </div>
          )}

          {onSeeAll && (
            <div style={{ marginTop: 12 }}>
              <Button variant="link" onClick={onSeeAll}>
                See all {a.screeningRecords.length} screening{a.screeningRecords.length === 1 ? "" : "s"} for {a.agentName} →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
