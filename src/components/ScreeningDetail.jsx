import React, { useEffect, useState } from "react";
import { COLORS, FONTS } from "../brand";
import { QA_QUESTIONS } from "../questions";
import { getScreening, attachmentUrl, teamLabel } from "../qaApi";

// Side panel with everything about one screening: score, every answer,
// feedback, call recordings, and the edit history. Shows an Edit button when
// the signed-in person may edit it.

const answerStyle = (a) => ({
  display: "inline-block",
  minWidth: 38,
  textAlign: "center",
  padding: "2px 8px",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 700,
  background: a === "Yes" ? COLORS.passBg : a === "No" ? COLORS.failBg : COLORS.offWhite,
  color: a === "Yes" ? COLORS.green : a === "No" ? COLORS.fail : COLORS.midGray,
});

const label = {
  fontSize: 11,
  fontWeight: 700,
  color: COLORS.midGray,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  margin: "18px 0 6px",
};

function fmtDate(iso, withTime = false) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const QUESTION_LABELS = Object.fromEntries(QA_QUESTIONS.map((q) => [q.field, q.label]));
const FIELD_LABELS = {
  agent_name: "Agent", agent_email: "Agent email", channel: "Channel", contact_id: "Contact ID",
  interaction_date: "Interaction date", suggestions: "Feedback", score_percent: "Score",
  pass_fail: "Result",
};

function describeChange(key, change) {
  const name = key.startsWith("answers.")
    ? QUESTION_LABELS[key.slice(8)] || key.slice(8)
    : FIELD_LABELS[key] || key;
  const show = (v) => (v === null || v === undefined || v === "" ? "—"
    : key === "score_percent" ? `${v}%` : key === "interaction_date" ? fmtDate(v) : String(v));
  if (key === "suggestions") return `${name} changed`;
  return `${name}: ${show(change.from)} → ${show(change.to)}`;
}

function Attachment({ file }) {
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const isMedia = /^(audio|video)\//.test(file.content_type);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      setUrl(await attachmentUrl(file.id));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "8px 10px", border: `1px solid ${COLORS.lightGray}`, borderRadius: 8, marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ fontSize: 13, color: COLORS.gray, wordBreak: "break-all" }}>
          {file.filename}
          <span style={{ color: COLORS.midGray, fontSize: 11 }}> · {fmtSize(file.size_bytes)}</span>
        </div>
        {!url && (
          <button type="button" onClick={load} disabled={busy} style={smallBtn}>
            {busy ? "Loading…" : isMedia ? "Play" : "Open"}
          </button>
        )}
        {url && (
          <a href={url} download={file.filename} style={{ ...smallBtn, textDecoration: "none" }}>Download</a>
        )}
      </div>
      {url && file.content_type.startsWith("audio/") && (
        <audio controls src={url} style={{ width: "100%", marginTop: 8 }} />
      )}
      {url && file.content_type.startsWith("video/") && (
        <video controls src={url} style={{ width: "100%", marginTop: 8 }} />
      )}
      {err && <div style={{ color: COLORS.fail, fontSize: 12, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

const smallBtn = {
  padding: "4px 12px",
  borderRadius: 6,
  border: `1.5px solid ${COLORS.orange}`,
  background: COLORS.white,
  color: COLORS.orange,
  fontSize: 12,
  fontWeight: 600,
  fontFamily: FONTS.heading,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export default function ScreeningDetail({ screeningId, onClose, onEdit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    getScreening(screeningId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [screeningId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pass = data?.pass_fail === "Pass";

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Screening details"
        style={{
          width: "min(560px, 100vw)", height: "100%", overflowY: "auto", background: COLORS.white,
          boxShadow: "-4px 0 24px rgba(0,0,0,0.15)", padding: "22px 24px", boxSizing: "border-box",
          fontFamily: FONTS.body,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: FONTS.heading, color: COLORS.gray }}>
              {data ? data.agent_name : "Screening"}
            </div>
            {data && (
              <div style={{ fontSize: 12, color: COLORS.midGray, marginTop: 2 }}>
                {teamLabel(data.team)} · {data.channel} · {fmtDate(data.interaction_date || data.submitted_at)}
                {data.contact_id ? <> · Contact <span style={{ fontFamily: "monospace" }}>{data.contact_id}</span></> : null}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...smallBtn, borderColor: COLORS.lightGray, color: COLORS.midGray }}>
            Close
          </button>
        </div>

        {error && <p style={{ color: COLORS.fail }}>{"⚠"} {error}</p>}
        {!data && !error && <p style={{ color: COLORS.midGray }}>Loading…</p>}

        {data && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 30, fontWeight: 800, fontFamily: FONTS.heading, color: pass ? COLORS.green : COLORS.fail }}>
                {data.score_percent}%
              </span>
              <span style={{
                padding: "3px 12px", borderRadius: 12, fontSize: 13, fontWeight: 700,
                background: pass ? COLORS.passBg : COLORS.failBg, color: pass ? COLORS.green : COLORS.fail,
              }}>
                {data.pass_fail}
              </span>
              <span style={{ fontSize: 12, color: COLORS.midGray }}>
                {data.score_total ? `${data.score_earned} of ${data.score_total} scored questions met` : ""}
              </span>
              {data.can_edit && (
                <button
                  type="button"
                  onClick={() => onEdit(data)}
                  style={{ ...smallBtn, marginLeft: "auto", background: COLORS.orange, color: COLORS.white, padding: "6px 18px" }}
                >
                  Edit
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: COLORS.midGray, marginTop: 6 }}>
              Evaluated by {data.evaluator_name || "—"} on {fmtDate(data.submitted_at, true)}
              {data.imported ? " · imported from SharePoint" : ""}
              {!data.can_edit && !data.imported && " · editable by the evaluator for 7 days, or by a manager"}
            </div>

            <div style={label}>Answers</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {QA_QUESTIONS.map((q) => (
                  <tr key={q.field} style={{ borderBottom: `1px solid ${COLORS.offWhite}` }}>
                    <td style={{ padding: "5px 0", color: COLORS.gray }}>{q.label}</td>
                    <td style={{ padding: "5px 0", textAlign: "right" }}>
                      <span style={answerStyle(data.answers?.[q.field])}>{data.answers?.[q.field] || "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={label}>Feedback for the agent</div>
            <div style={{ fontSize: 13, color: COLORS.gray, whiteSpace: "pre-wrap" }}>
              {data.suggestions || <span style={{ color: COLORS.midGray }}>None</span>}
            </div>

            <div style={label}>Call recordings & files</div>
            {data.attachments.length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.midGray }}>
                None{data.can_edit ? " — use Edit to attach the call." : ""}
              </div>
            ) : (
              data.attachments.map((f) => <Attachment key={f.id} file={f} />)
            )}

            <div style={label}>Edit history</div>
            {data.edits.length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.midGray }}>Not edited since it was submitted.</div>
            ) : (
              data.edits.slice().reverse().map((e) => (
                <div key={e.id} style={{ borderLeft: `3px solid ${COLORS.sky}`, padding: "4px 10px", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: COLORS.midGray }}>
                    {fmtDate(e.edited_at, true)} · {e.edited_by}
                  </div>
                  {Object.entries(e.changes).map(([k, c]) => (
                    <div key={k} style={{ fontSize: 12, color: COLORS.gray }}>{describeChange(k, c)}</div>
                  ))}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
