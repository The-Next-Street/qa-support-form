import React, { useEffect, useMemo, useState } from "react";
import { COLORS } from "../brand";
import { teamLabel } from "../qaApi";
import ScreeningDetail from "./ScreeningDetail";
import { useQaData, inTeam } from "./useQaData";
import {
  layout, PageHeader, Section, FilterBar, Button, Dash, Notice, Loading, inputStyle,
  table, SortHeader, ChannelTag, ResultBadge, fmtDate, scoreColor,
  defaultFilters, inRange, rangeLabel,
} from "./ui";

// Every screening for the chosen team and dates, with search and filters.

const PAGE_SIZE = 50;
const EMPTY = { search: "", channel: "All", result: "All", agent: "All" };

export default function Screenings({
  refreshKey = 0, onEdit, onNew,
  filters: filtersProp, onFiltersChange, initialListFilters,
}) {
  const [localFilters, setLocalFilters] = useState(defaultFilters);
  const filters = filtersProp || localFilters;
  const setFilters = onFiltersChange || setLocalFilters;

  const { records, truncated, loading, error } = useQaData(refreshKey);
  const [list, setList] = useState({ ...EMPTY, ...(initialListFilters || {}) });
  const [shown, setShown] = useState(PAGE_SIZE);
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [openScreeningId, setOpenScreeningId] = useState(null);

  // Opening this page from the Dashboard ("View all fails", "See all for X")
  useEffect(() => {
    if (initialListFilters) setList({ ...EMPTY, ...initialListFilters });
  }, [initialListFilters]);
  useEffect(() => setShown(PAGE_SIZE), [list, filters, sort]);

  const scoped = useMemo(
    () => records.filter((r) => inTeam(r.team, filters.team) && inRange(r.date, filters)),
    [records, filters]
  );
  const agents = useMemo(
    () => [...new Set(scoped.map((r) => r.agentName).filter(Boolean))].sort(),
    [scoped]
  );

  const filtered = useMemo(() => {
    const q = list.search.trim().toLowerCase();
    const dir = sort.dir === "desc" ? -1 : 1;
    return scoped
      .filter((r) => list.channel === "All" || r.channel === list.channel)
      .filter((r) => list.result === "All" || r.passFail === list.result)
      .filter((r) => list.agent === "All" || r.agentName === list.agent)
      .filter((r) => !q || [r.agentName, r.evaluatorName, r.contactId].some((v) => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => {
        if (sort.key === "date") return dir * ((a.date?.getTime() || 0) - (b.date?.getTime() || 0));
        if (sort.key === "scorePercent") return dir * (a.scorePercent - b.scorePercent);
        return dir * String(a[sort.key] || "").localeCompare(String(b[sort.key] || ""));
      });
  }, [scoped, list, sort]);

  const active = list.search || list.channel !== "All" || list.result !== "All" || list.agent !== "All";
  const set = (patch) => setList((l) => ({ ...l, ...patch }));

  return (
    <div style={layout.page}>
      <div style={layout.inner}>
        <PageHeader
          title="Screenings"
          subtitle={`Every QA screening · ${rangeLabel(filters)}`}
          actions={onNew && <Button onClick={onNew}>+ New screening</Button>}
        />

        <FilterBar filters={filters} onChange={setFilters} />

        {loading ? (
          <Loading text="Loading screenings…" />
        ) : error ? (
          <Notice tone="error">{"⚠"} {error}</Notice>
        ) : (
          <Section
            flush
            title={`${filtered.length} screening${filtered.length === 1 ? "" : "s"}`}
            subtitle={active ? `Filtered from ${scoped.length}` : "Click a row to see answers, recordings and history"}
            right={
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="search"
                  placeholder="Search agent, evaluator, contact ID"
                  aria-label="Search screenings"
                  value={list.search}
                  onChange={(e) => set({ search: e.target.value })}
                  style={{ ...inputStyle, width: 240 }}
                />
                <select aria-label="Channel" value={list.channel} onChange={(e) => set({ channel: e.target.value })} style={inputStyle}>
                  <option value="All">All channels</option>
                  {["Phone", "Chat", "Email", "SMS"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select aria-label="Result" value={list.result} onChange={(e) => set({ result: e.target.value })} style={inputStyle}>
                  <option value="All">Pass and fail</option>
                  <option value="Pass">Pass only</option>
                  <option value="Fail">Fail only</option>
                </select>
                <select aria-label="Agent" value={list.agent} onChange={(e) => set({ agent: e.target.value })} style={inputStyle}>
                  <option value="All">All agents</option>
                  {list.agent !== "All" && !agents.includes(list.agent) && <option value={list.agent}>{list.agent}</option>}
                  {agents.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                {active && <Button variant="link" onClick={() => setList(EMPTY)}>Clear</Button>}
              </div>
            }
          >
            {truncated && <div style={{ padding: "12px 24px 0" }}><Notice>Showing the newest 5,000 screenings.</Notice></div>}
            {filtered.length === 0 ? (
              <div style={{ padding: "28px 24px", textAlign: "center", fontSize: 14, color: COLORS.midGray }}>
                {scoped.length === 0 ? "No screenings for this team and date range." : "No screenings match these filters."}
              </div>
            ) : (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={table.table}>
                    <thead>
                      <tr>
                        <SortHeader label="Date" sortKey="date" sort={sort} onSort={setSort} />
                        <SortHeader label="Agent" sortKey="agentName" sort={sort} onSort={setSort} />
                        <th style={table.th}>Channel</th>
                        <th style={table.th}>Contact ID</th>
                        <SortHeader label="Score" sortKey="scorePercent" sort={sort} onSort={setSort} align="right" />
                        <th style={table.th}>Result</th>
                        <SortHeader label="Evaluator" sortKey="evaluatorName" sort={sort} onSort={setSort} />
                        {filters.team === "all" && <th style={table.th}>Team</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, shown).map((r, i) => (
                        <tr
                          key={r.id || i}
                          onClick={() => setOpenScreeningId(r.id)}
                          title="Open screening details"
                          style={{ cursor: "pointer" }}
                        >
                          <td style={{ ...table.td, whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td>
                          <td style={{ ...table.td, fontWeight: 600 }}>{r.agentName}</td>
                          <td style={table.td}><ChannelTag channel={r.channel} /></td>
                          <td style={{ ...table.td, fontFamily: "monospace", fontSize: 12 }}>{r.contactId || <Dash />}</td>
                          <td style={{ ...table.td, textAlign: "right", fontWeight: 700, color: scoreColor(r.scorePercent) }}>{r.scorePercent}%</td>
                          <td style={table.td}><ResultBadge result={r.passFail} /></td>
                          <td style={table.td}>
                            {r.evaluatorName || <Dash />}
                            {r.edited && <span style={{ marginLeft: 6, fontSize: 11, color: COLORS.sky }}>edited</span>}
                          </td>
                          {filters.team === "all" && <td style={table.td}>{teamLabel(r.team)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filtered.length > shown && (
                  <div style={{ padding: "14px 24px", textAlign: "center", borderTop: "1px solid #F0F0F0" }}>
                    <Button variant="secondary" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                      Show {Math.min(PAGE_SIZE, filtered.length - shown)} more
                    </Button>
                    <span style={{ marginLeft: 12, fontSize: 12, color: COLORS.midGray }}>
                      Showing {shown} of {filtered.length}
                    </span>
                  </div>
                )}
              </>
            )}
          </Section>
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
