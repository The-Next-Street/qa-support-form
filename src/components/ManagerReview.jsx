import React, { useState, useEffect, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest, sharepointConfig } from "../authConfig";
import { COLORS, FONTS, GRADIENT } from "../brand";

const FLAG_THRESHOLD = 60; // Agents with avg below this are flagged for manager review
const GRAPH_SITE =
  "allstardriver.sharepoint.com:/sites/ServiceExcellenceDepartment-ALL-CustomerServiceTeam:";

// ── Data fetch (mirrors Dashboard) ─────────────────────────────────────────

async function fetchQARecords(accessToken) {
  const { listName } = sharepointConfig;
  const endpoint =
    `https://graph.microsoft.com/v1.0/sites/${GRAPH_SITE}/lists/${listName}/items` +
    `?expand=fields&$top=500`;

  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
    },
  });
  if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.value || []).map((item) => {
    const f = item.fields || {};
    const dateStr = f.InteractionDate || f.SubmissionDate || f.Created || item.createdDateTime;
    return {
      id: item.id,
      agentName: f.AgentName || "Unknown",
      agentEmail: f.AgentEmail || "",
      evaluatorName: f.EvaluatorName || "",
      channel: f.Channel || "Phone",
      contactId: f.ContactId || "",
      scorePercent: Number(f.ScorePercent ?? f.TotalScore ?? 0),
      passFail: f.PassFail || ((Number(f.ScorePercent ?? 0)) >= 80 ? "Pass" : "Fail"),
      date: dateStr ? new Date(dateStr) : null,
      suggestions: f.SuggestionsForImprovement || "",
    };
  });
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = {
  page: { minHeight: "100vh", background: COLORS.offWhite, padding: "24px 16px", fontFamily: FONTS.body },
  card: {
    maxWidth: 1100, margin: "0 auto", background: COLORS.white, borderRadius: 12,
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)", overflow: "hidden",
  },
  header: { background: GRADIENT.orange, padding: "28px 32px", color: COLORS.white },
  headerTitle: { margin: 0, fontSize: 24, fontWeight: 700, fontFamily: FONTS.heading },
  headerSub: { margin: "6px 0 0", fontSize: 14, color: "rgba(255,255,255,0.8)" },
  body: { padding: "28px 32px" },

  flaggedBanner: {
    padding: "14px 18px",
    background: COLORS.failBg,
    border: `2px solid ${COLORS.fail}`,
    borderRadius: 10,
    marginBottom: 20,
    color: COLORS.fail,
    fontFamily: FONTS.heading,
    fontWeight: 600,
    fontSize: 15,
  },
  okBanner: {
    padding: "14px 18px",
    background: COLORS.passBg,
    border: `2px solid ${COLORS.green}`,
    borderRadius: 10,
    marginBottom: 20,
    color: COLORS.green,
    fontFamily: FONTS.heading,
    fontWeight: 600,
    fontSize: 15,
  },

  sectionHeader: {
    fontSize: 16,
    fontWeight: 700,
    fontFamily: FONTS.heading,
    color: COLORS.gray,
    margin: "24px 0 12px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  agentCard: (flagged) => ({
    border: `2px solid ${flagged ? COLORS.fail : COLORS.lightGray}`,
    background: flagged ? COLORS.failBg : COLORS.white,
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
  }),
  agentHeader: (flagged) => ({
    padding: "14px 18px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    background: flagged ? "#FFE8E8" : COLORS.white,
    borderBottom: `1px solid ${flagged ? "#FFCDD2" : COLORS.offWhite}`,
  }),
  agentName: { fontWeight: 700, color: COLORS.gray, fontSize: 16, fontFamily: FONTS.heading },
  agentMeta: { fontSize: 12, color: COLORS.midGray, marginTop: 2 },
  agentAvg: (flagged) => ({
    fontSize: 24,
    fontWeight: 800,
    fontFamily: FONTS.heading,
    color: flagged ? COLORS.fail : COLORS.green,
    minWidth: 70,
    textAlign: "right",
  }),
  flagBadge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 12,
    background: COLORS.fail,
    color: COLORS.white,
    fontSize: 11,
    fontWeight: 700,
    marginLeft: 8,
    fontFamily: FONTS.heading,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left",
    padding: "8px 12px",
    background: "#F5F5F5",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase",
    color: COLORS.midGray,
    letterSpacing: 0.5,
  },
  td: { padding: "10px 12px", borderBottom: `1px solid ${COLORS.offWhite}`, color: COLORS.gray },

  statsRow: { display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" },
  statCard: (color) => ({
    flex: "1 1 180px",
    padding: "20px",
    borderRadius: 10,
    background: COLORS.white,
    border: `2px solid ${color}`,
    textAlign: "center",
  }),
  statNum: (color) => ({ fontSize: 32, fontWeight: 800, fontFamily: FONTS.heading, color, margin: 0 }),
  statLabel: { fontSize: 11, color: COLORS.midGray, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 },

  center: { textAlign: "center", padding: "48px 20px", color: COLORS.midGray, fontSize: 15 },
  errorBox: {
    background: COLORS.failBg, border: "1px solid #FFCDD2", borderRadius: 8,
    padding: "12px 16px", color: COLORS.fail, fontSize: 14, marginBottom: 16,
  },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function ManagerReview() {
  const { instance, accounts } = useMsal();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    async function load() {
      try {
        let tokenRes;
        try {
          tokenRes = await instance.acquireTokenSilent({ ...loginRequest, account: accounts[0] });
        } catch {
          tokenRes = await instance.acquireTokenPopup(loginRequest);
        }
        const data = await fetchQARecords(tokenRes.accessToken);
        setRecords(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [instance, accounts]);

  // Group by agent and compute averages
  const agentSummaries = useMemo(() => {
    const byAgent = {};
    records.forEach((r) => {
      if (!byAgent[r.agentName]) {
        byAgent[r.agentName] = {
          agentName: r.agentName,
          agentEmail: r.agentEmail,
          screenings: [],
          totalScore: 0,
          passCount: 0,
        };
      }
      const a = byAgent[r.agentName];
      a.screenings.push(r);
      a.totalScore += r.scorePercent;
      if (r.passFail === "Pass") a.passCount += 1;
    });
    const summaries = Object.values(byAgent).map((a) => ({
      ...a,
      count: a.screenings.length,
      avgScore: a.screenings.length > 0 ? Math.round(a.totalScore / a.screenings.length) : 0,
      passRate: a.screenings.length > 0 ? Math.round((a.passCount / a.screenings.length) * 100) : 0,
      flagged: a.screenings.length > 0 && a.totalScore / a.screenings.length < FLAG_THRESHOLD,
      // Sort screenings newest first within an agent
      screenings: [...a.screenings].sort((x, y) => (y.date?.getTime() || 0) - (x.date?.getTime() || 0)),
    }));
    // Sort: flagged first (lowest avg first), then others by highest avg
    summaries.sort((a, b) => {
      if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
      if (a.flagged) return a.avgScore - b.avgScore; // lowest first when flagged
      return b.avgScore - a.avgScore;                 // highest first when OK
    });
    return summaries;
  }, [records]);

  const flagged = agentSummaries.filter((a) => a.flagged);
  const okAgents = agentSummaries.filter((a) => !a.flagged);

  const overallStats = useMemo(() => {
    const totalScreenings = records.length;
    const teamAvg = totalScreenings > 0
      ? Math.round(records.reduce((sum, r) => sum + r.scorePercent, 0) / totalScreenings)
      : 0;
    const lowest = agentSummaries.length > 0
      ? agentSummaries.reduce((min, a) => (a.avgScore < min.avgScore ? a : min), agentSummaries[0])
      : null;
    return { totalScreenings, teamAvg, flaggedCount: flagged.length, lowest };
  }, [records, agentSummaries, flagged]);

  function toggle(name) {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function formatDate(d) {
    if (!d) return "-";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <h1 style={s.headerTitle}>Manager Review</h1>
          <p style={s.headerSub}>
            Agents with an average QA score below {FLAG_THRESHOLD}% are flagged for coaching review
          </p>
        </div>

        <div style={s.body}>
          {loading ? (
            <div style={s.center}>
              <p>Loading screenings...</p>
            </div>
          ) : error ? (
            <div style={s.errorBox}>{"\u26A0"} {error}</div>
          ) : records.length === 0 ? (
            <div style={s.center}>
              <p style={{ fontSize: 18, fontFamily: FONTS.heading, color: COLORS.gray }}>
                No screenings yet
              </p>
              <p>There are no QA screenings to review.</p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div style={s.statsRow}>
                <div style={s.statCard(COLORS.orange)}>
                  <p style={s.statNum(COLORS.orange)}>{overallStats.totalScreenings}</p>
                  <p style={s.statLabel}>Total Screenings</p>
                </div>
                <div style={s.statCard(COLORS.sky)}>
                  <p style={s.statNum(COLORS.sky)}>{overallStats.teamAvg}%</p>
                  <p style={s.statLabel}>Team Avg Score</p>
                </div>
                <div style={s.statCard(flagged.length > 0 ? COLORS.fail : COLORS.green)}>
                  <p style={s.statNum(flagged.length > 0 ? COLORS.fail : COLORS.green)}>
                    {flagged.length}
                  </p>
                  <p style={s.statLabel}>Flagged Agents</p>
                </div>
                <div style={s.statCard(COLORS.gray)}>
                  <p style={s.statNum(COLORS.gray)}>
                    {overallStats.lowest ? `${overallStats.lowest.avgScore}%` : "-"}
                  </p>
                  <p style={s.statLabel}>Lowest Avg</p>
                </div>
              </div>

              {/* Banner */}
              {flagged.length > 0 ? (
                <div style={s.flaggedBanner}>
                  {"\u26A0"} {flagged.length} agent{flagged.length > 1 ? "s" : ""} below {FLAG_THRESHOLD}% {"\u2014"} coaching recommended
                </div>
              ) : (
                <div style={s.okBanner}>
                  {"\u2714"} All agents are averaging at or above {FLAG_THRESHOLD}%
                </div>
              )}

              {/* Flagged agents */}
              {flagged.length > 0 && (
                <>
                  <div style={s.sectionHeader}>
                    <span style={{ color: COLORS.fail }}>{"\u26A0"}</span>
                    Agents Needing Review
                  </div>
                  {flagged.map((agent) => (
                    <AgentBlock
                      key={agent.agentName}
                      agent={agent}
                      expanded={!!expanded[agent.agentName]}
                      onToggle={() => toggle(agent.agentName)}
                      formatDate={formatDate}
                    />
                  ))}
                </>
              )}

              {/* Other agents */}
              {okAgents.length > 0 && (
                <>
                  <div style={s.sectionHeader}>
                    <span style={{ color: COLORS.green }}>{"\u2714"}</span>
                    Other Agents
                  </div>
                  {okAgents.map((agent) => (
                    <AgentBlock
                      key={agent.agentName}
                      agent={agent}
                      expanded={!!expanded[agent.agentName]}
                      onToggle={() => toggle(agent.agentName)}
                      formatDate={formatDate}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentBlock({ agent, expanded, onToggle, formatDate }) {
  return (
    <div style={s.agentCard(agent.flagged)}>
      <div style={s.agentHeader(agent.flagged)} onClick={onToggle}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={s.agentName}>{agent.agentName}</span>
            {agent.flagged && <span style={s.flagBadge}>Flagged</span>}
          </div>
          <div style={s.agentMeta}>
            {agent.count} screening{agent.count !== 1 ? "s" : ""} {"\u00B7"} {agent.passRate}% pass rate
            {agent.agentEmail ? <> {"\u00B7"} {agent.agentEmail}</> : null}
          </div>
        </div>
        <div style={s.agentAvg(agent.flagged)}>{agent.avgScore}%</div>
        <span style={{ marginLeft: 12, color: COLORS.midGray, fontSize: 14 }}>
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
      </div>
      {expanded && (
        <div style={{ padding: 16, background: COLORS.white }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Channel</th>
                <th style={s.th}>Contact ID</th>
                <th style={s.th}>Evaluator</th>
                <th style={{ ...s.th, textAlign: "right" }}>Score</th>
                <th style={{ ...s.th, textAlign: "right" }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {agent.screenings.map((r) => (
                <tr key={r.id}>
                  <td style={s.td}>{formatDate(r.date)}</td>
                  <td style={s.td}>{r.channel}</td>
                  <td style={{ ...s.td, fontFamily: "monospace", fontSize: 12 }}>{r.contactId || "-"}</td>
                  <td style={s.td}>{r.evaluatorName}</td>
                  <td style={{
                    ...s.td,
                    textAlign: "right",
                    fontWeight: 700,
                    color: r.scorePercent >= 80 ? COLORS.green : r.scorePercent < FLAG_THRESHOLD ? COLORS.fail : COLORS.orange,
                  }}>
                    {r.scorePercent}%
                  </td>
                  <td style={{
                    ...s.td,
                    textAlign: "right",
                    fontWeight: 600,
                    color: r.passFail === "Pass" ? COLORS.green : COLORS.fail,
                  }}>
                    {r.passFail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {agent.screenings.some((r) => r.suggestions) && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.midGray, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Evaluator Suggestions
              </div>
              {agent.screenings
                .filter((r) => r.suggestions)
                .map((r) => (
                  <div
                    key={`${r.id}-sug`}
                    style={{
                      padding: "8px 12px",
                      marginBottom: 6,
                      background: COLORS.offWhite,
                      borderLeft: `3px solid ${COLORS.orange}`,
                      borderRadius: 4,
                      fontSize: 13,
                      color: COLORS.gray,
                    }}
                  >
                    <div style={{ fontSize: 11, color: COLORS.midGray, marginBottom: 2 }}>
                      {formatDate(r.date)} {"\u00B7"} {r.evaluatorName}
                    </div>
                    {r.suggestions}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
