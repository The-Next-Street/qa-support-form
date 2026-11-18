import React from "react";
import { COLORS, FONTS } from "../brand";

// Shared layout pieces so every screen has the same header, spacing,
// filter bar and table look.

// ── Page layout ─────────────────────────────────────────────────────────────

export const layout = {
  page: {
    minHeight: "calc(100vh - 44px)",
    background: COLORS.offWhite,
    padding: "24px 16px 48px",
    fontFamily: FONTS.body,
  },
  inner: { maxWidth: 1180, margin: "0 auto" },
  card: {
    background: COLORS.white,
    borderRadius: 12,
    border: `1px solid ${COLORS.lightGray}`,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    marginBottom: 20,
    overflow: "hidden",
  },
  cardBody: { padding: "20px 24px" },
};

// Header styles the older screens use for their title block (white header
// with an orange accent instead of a full orange banner).
export const headerStyles = {
  header: {
    background: COLORS.white,
    padding: "20px 32px",
    borderBottom: `1px solid ${COLORS.lightGray}`,
    borderTop: `4px solid ${COLORS.orange}`,
    color: COLORS.gray,
  },
  headerTitle: { margin: 0, fontSize: 22, fontWeight: 700, fontFamily: FONTS.heading, color: COLORS.gray },
  headerSub: { margin: "4px 0 0", fontSize: 14, color: COLORS.midGray },
};

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      gap: 16, flexWrap: "wrap", marginBottom: 18,
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: FONTS.heading, color: COLORS.gray }}>
          {title}
        </h1>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: 14, color: COLORS.midGray }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

export function Section({ title, subtitle, right, children, flush = false }) {
  return (
    <section style={layout.card}>
      {(title || right) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          flexWrap: "wrap", padding: "16px 24px",
          borderBottom: `1px solid ${COLORS.lightGray}`,
        }}>
          <div>
            {title && (
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: FONTS.heading, color: COLORS.gray }}>
                {title}
              </h2>
            )}
            {subtitle && <div style={{ fontSize: 12, color: COLORS.midGray, marginTop: 2 }}>{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={flush ? undefined : layout.cardBody}>{children}</div>
    </section>
  );
}

// ── Buttons and inputs ──────────────────────────────────────────────────────

export function Button({ children, variant = "primary", style, ...props }) {
  const primary = variant === "primary";
  const link = variant === "link";
  return (
    <button
      type="button"
      {...props}
      style={{
        padding: link ? 0 : "8px 16px",
        borderRadius: 8,
        border: link ? "none" : `1.5px solid ${COLORS.orange}`,
        background: primary ? COLORS.orange : link ? "none" : COLORS.white,
        color: primary ? COLORS.white : COLORS.orange,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: FONTS.heading,
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export const inputStyle = {
  padding: "7px 10px",
  borderRadius: 8,
  border: `1.5px solid ${COLORS.lightGray}`,
  fontSize: 13,
  fontFamily: FONTS.body,
  color: COLORS.gray,
  background: COLORS.white,
};

// Segmented control (team tabs, sub-views).
export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} style={{
      display: "inline-flex", background: "#F1F1F1", borderRadius: 10, padding: 3, gap: 2, flexWrap: "wrap",
    }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.key)}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: on ? COLORS.white : "transparent",
              boxShadow: on ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              color: on ? COLORS.gray : COLORS.midGray,
              fontSize: 13, fontWeight: 600, fontFamily: FONTS.heading, cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Team + date filters (shared by Dashboard and Screenings) ────────────────

export const TEAM_TABS = [
  { key: "customer_support", label: "Customer Support" },
  { key: "internal_support", label: "Internal Support" },
  { key: "all", label: "All Teams" },
];

export const RANGE_PRESETS = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "365d", label: "Last 12 months", days: 365 },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom dates" },
];

// YYYY-MM-DD in the viewer's own time zone (toISOString would use UTC and
// jump a day ahead in the evening).
export function localIsoDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function rangeForPreset(key, today = new Date()) {
  const preset = RANGE_PRESETS.find((p) => p.key === key);
  if (!preset || key === "all" || key === "custom") return { start: "", end: "" };
  const start = new Date(today);
  start.setDate(start.getDate() - (preset.days - 1));
  return { start: localIsoDate(start), end: localIsoDate(today) };
}

export function defaultFilters() {
  return { team: "customer_support", preset: "30d", ...rangeForPreset("30d") };
}

export function inRange(date, { start, end }) {
  if (!start && !end) return true;
  if (!date) return false;
  const t = date.getTime();
  if (start && t < new Date(`${start}T00:00:00`).getTime()) return false;
  if (end && t > new Date(`${end}T23:59:59.999`).getTime()) return false;
  return true;
}

export function rangeDays({ start, end }) {
  if (!start || !end) return Infinity;
  return Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1;
}

export function rangeLabel(filters) {
  if (filters.preset !== "custom") return RANGE_PRESETS.find((p) => p.key === filters.preset)?.label || "";
  const f = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "…");
  return `${f(filters.start)} – ${f(filters.end)}`;
}

export function FilterBar({ filters, onChange, children }) {
  const setPreset = (preset) => {
    if (preset === "custom") {
      const r = filters.start ? filters : rangeForPreset("30d");
      onChange({ ...filters, preset, start: r.start, end: r.end });
    } else {
      onChange({ ...filters, preset, ...rangeForPreset(preset) });
    }
  };
  return (
    <div style={{
      ...layout.card, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center",
      flexWrap: "wrap", justifyContent: "space-between",
    }}>
      <Segmented
        ariaLabel="Team"
        options={TEAM_TABS}
        value={filters.team}
        onChange={(team) => onChange({ ...filters, team })}
      />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {children}
        <select
          aria-label="Date range"
          value={filters.preset}
          onChange={(e) => setPreset(e.target.value)}
          style={inputStyle}
        >
          {RANGE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {filters.preset === "custom" && (
          <>
            <input
              type="date" aria-label="From" value={filters.start} style={inputStyle}
              onChange={(e) => onChange({ ...filters, start: e.target.value })}
            />
            <span style={{ color: COLORS.midGray, fontSize: 13 }}>to</span>
            <input
              type="date" aria-label="To" value={filters.end} style={inputStyle}
              onChange={(e) => onChange({ ...filters, end: e.target.value })}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Numbers ─────────────────────────────────────────────────────────────────

export function scoreColor(pct) {
  if (pct == null) return COLORS.midGray;
  return pct >= 80 ? COLORS.green : pct >= 70 ? COLORS.orange : COLORS.fail;
}

export function StatTile({ label, value, hint, color = COLORS.gray }) {
  return (
    <div style={{
      flex: "1 1 170px", background: COLORS.white, border: `1px solid ${COLORS.lightGray}`,
      borderRadius: 12, padding: "16px 18px",
    }}>
      <div style={{ fontSize: 12, color: COLORS.midGray, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: FONTS.heading, color, marginTop: 4, lineHeight: 1.1 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 12, color: COLORS.midGray, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export const Dash = () => <span style={{ color: "#C4C4C4" }}>—</span>;

// ── Tables ──────────────────────────────────────────────────────────────────

export const table = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    background: "#FAFAFA",
    color: COLORS.midGray,
    fontWeight: 600,
    fontFamily: FONTS.heading,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: `1px solid ${COLORS.lightGray}`,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "11px 12px",
    borderBottom: `1px solid #F0F0F0`,
    color: COLORS.gray,
    verticalAlign: "middle",
  },
};

export function SortHeader({ label, sortKey, sort, onSort, align = "left" }) {
  const active = sort.key === sortKey;
  return (
    <th
      style={{ ...table.th, textAlign: align, cursor: "pointer", userSelect: "none", color: active ? COLORS.gray : COLORS.midGray }}
      onClick={() => onSort({ key: sortKey, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
      aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}
    >
      {label}{active ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
}

export function ChannelTag({ channel }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: "#FEF3E2", color: "#B85F0B",
    }}>
      {channel}
    </span>
  );
}

export function ResultBadge({ result }) {
  const pass = result === "Pass";
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700,
      fontFamily: FONTS.heading,
      background: pass ? COLORS.passBg : COLORS.failBg,
      color: pass ? "#4E8A2A" : COLORS.fail,
    }}>
      {result}
    </span>
  );
}

export function fmtDate(d) {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export function Notice({ tone = "info", children }) {
  const tones = {
    info: { bg: "#EEF7FA", border: "#BFE3EC", color: "#1D6F80" },
    warn: { bg: COLORS.warningBg, border: COLORS.clementine, color: "#795548" },
    error: { bg: COLORS.failBg, border: "#FFCDD2", color: COLORS.fail },
  }[tone];
  return (
    <div style={{
      background: tones.bg, border: `1px solid ${tones.border}`, color: tones.color,
      borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

export function Loading({ text = "Loading…" }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: COLORS.midGray, fontSize: 14 }}>
      <style>{`@keyframes qaPulse { 0%,100% { opacity:.3 } 50% { opacity:1 } }`}</style>
      <div>
        {[0, 0.2, 0.4].map((d) => (
          <span key={d} style={{
            display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.orange,
            margin: "0 3px", animation: "qaPulse 1.2s ease-in-out infinite", animationDelay: `${d}s`,
          }} />
        ))}
      </div>
      <p style={{ marginTop: 12 }}>{text}</p>
    </div>
  );
}
