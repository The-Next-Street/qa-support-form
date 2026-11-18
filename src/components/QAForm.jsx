import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../authConfig";
import { sendScoreEmail } from "../emailService";
import { QA_QUESTIONS_BY_CHANNEL, CHANNELS, calculateScore } from "../questions";
import { COLORS, FONTS, GRADIENT } from "../brand";
import { headerStyles } from "./ui";
import { qaFetch, createScreening, updateScreening, uploadAttachment } from "../qaApi";

// ── CXone agent roster ─────────────────────────────────────────────────────


let _agentRosterCache = null;
let _agentRosterPromise = null;

async function fetchAgentRoster() {
  // Only return cache if we actually got a non-empty result
  if (_agentRosterCache && _agentRosterCache.length > 0) return _agentRosterCache;
  if (_agentRosterPromise) return _agentRosterPromise;
  _agentRosterPromise = (async () => {
    try {
      const res = await qaFetch("/api/metrics/agents");
      if (!res.ok) return [];
      const data = await res.json();
      const list = data.agents || [];
      // Only cache non-empty results so a failed fetch doesn't lock in an empty list
      if (list.length > 0) _agentRosterCache = list;
      return list;
    } catch {
      return [];
    } finally {
      _agentRosterPromise = null;
    }
  })();
  return _agentRosterPromise;
}

// Dropdown specifically for CXone agents (limits to the active roster).
function AgentTypeAhead({ value, email, onChange, onSelect, placeholder, label }) {
  const [roster, setRoster] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAgentRoster().then((list) => {
      if (!cancelled) {
        setRoster(list);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Filter roster by current query (case-insensitive, substring match)
  const suggestions = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    if (!q) return roster.slice(0, 50);
    return roster.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 50);
  }, [value, roster]);

  function handleChange(e) {
    const val = e.target.value;
    onChange(val, "");
    setShowDropdown(true);
  }
  function handleSelect(agent) {
    onSelect(agent.name, agent.email || "");
    setShowDropdown(false);
  }

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.gray, marginBottom: 6, display: "block" }}>
        {label}
      </label>
      <input
        style={{
          padding: "10px 12px",
          border: `1.5px solid ${COLORS.lightGray}`,
          borderRadius: 8,
          fontSize: 14,
          outline: "none",
          fontFamily: FONTS.body,
          width: "100%",
          boxSizing: "border-box",
        }}
        value={value}
        onChange={handleChange}
        onFocus={() => setShowDropdown(true)}
        placeholder={placeholder || (loading ? "Loading agents..." : "Type to filter agents...")}
        autoComplete="off"
      />
      {email && (
        <div style={{ fontSize: 11, color: COLORS.midGray, marginTop: 3 }}>{email}</div>
      )}
      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: COLORS.white,
            border: `1.5px solid ${COLORS.lightGray}`,
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            zIndex: 100,
            maxHeight: 280,
            overflowY: "auto",
            marginTop: 4,
          }}
        >
          {loading && (
            <div style={{ padding: "10px 14px", fontSize: 13, color: COLORS.midGray }}>Loading agents…</div>
          )}
          {!loading && suggestions.length === 0 && (
            <div style={{ padding: "10px 14px", fontSize: 13, color: COLORS.midGray }}>
              No matching agents in CXone.
            </div>
          )}
          {suggestions.map((agent) => (
            <div
              key={agent.agentId || agent.name}
              onClick={() => handleSelect(agent)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                fontSize: 14,
                borderBottom: `1px solid ${COLORS.offWhite}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#FEF3E2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.white)}
            >
              <div style={{ fontWeight: 600, color: COLORS.gray }}>{agent.name}</div>
              {agent.email && (
                <div style={{ fontSize: 12, color: COLORS.midGray, marginTop: 2 }}>{agent.email}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Microsoft Graph people search (used for Evaluator field) ────────────────

async function searchPeople(accessToken, query) {
  if (!query || query.length < 2) return [];
  const endpoint =
    `https://graph.microsoft.com/v1.0/users?$filter=startswith(displayName,'${encodeURIComponent(query)}') or startswith(mail,'${encodeURIComponent(query)}')&$top=8&$select=displayName,mail,id`;
  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.value || []).map((u) => ({
      name: u.displayName,
      email: u.mail || "",
      id: u.id,
    }));
  } catch {
    return [];
  }
}

// ── Type-ahead component ────────────────────────────────────────────────────

function UserTypeAhead({ value, email, onChange, onSelect, placeholder, label, accessToken }) {
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  const doSearch = useCallback(
    async (q) => {
      if (!accessToken || q.length < 2) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      const results = await searchPeople(accessToken, q);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
      setLoading(false);
    },
    [accessToken]
  );

  function handleChange(e) {
    const val = e.target.value;
    onChange(val, "");
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  }

  function handleSelect(user) {
    onSelect(user.name, user.email);
    setShowDropdown(false);
    setSuggestions([]);
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.gray, marginBottom: 6, display: "block" }}>
        {label}
      </label>
      <input
        style={{
          padding: "10px 12px",
          border: `1.5px solid ${COLORS.lightGray}`,
          borderRadius: 8,
          fontSize: 14,
          outline: "none",
          fontFamily: FONTS.body,
          width: "100%",
          boxSizing: "border-box",
        }}
        value={value}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {email && (
        <div style={{ fontSize: 11, color: COLORS.midGray, marginTop: 3 }}>{email}</div>
      )}
      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: COLORS.white,
            border: `1.5px solid ${COLORS.lightGray}`,
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            zIndex: 100,
            maxHeight: 220,
            overflowY: "auto",
            marginTop: 4,
          }}
        >
          {loading && (
            <div style={{ padding: "10px 14px", fontSize: 13, color: COLORS.midGray }}>Searching...</div>
          )}
          {suggestions.map((user) => (
            <div
              key={user.id || user.email}
              onClick={() => handleSelect(user)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                fontSize: 14,
                borderBottom: `1px solid ${COLORS.offWhite}`,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#FEF3E2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.white)}
            >
              <div style={{ fontWeight: 600, color: COLORS.gray }}>{user.name}</div>
              {user.email && (
                <div style={{ fontSize: 12, color: COLORS.midGray, marginTop: 2 }}>{user.email}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: COLORS.offWhite,
    padding: "24px 16px",
    fontFamily: FONTS.body,
  },
  card: {
    maxWidth: 860,
    margin: "0 auto",
    background: COLORS.white,
    borderRadius: 12,
    border: "1px solid #E8E8E8", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    overflow: "hidden",
  },
  ...headerStyles,
  body: { padding: "28px 32px" },

  row: { display: "flex", gap: 16, marginBottom: 16 },
  col: { flex: 1, display: "flex", flexDirection: "column" },
  label: { fontSize: 13, fontWeight: 600, color: COLORS.gray, marginBottom: 6 },
  input: {
    padding: "10px 12px",
    border: `1.5px solid ${COLORS.lightGray}`,
    borderRadius: 8,
    fontSize: 14,
    outline: "none",
    transition: "border-color 0.15s",
    fontFamily: FONTS.body,
  },

  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "24px 0 12px",
  },
  sectionPill: {
    background: COLORS.orange,
    color: COLORS.white,
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: FONTS.heading,
  },
  sectionLine: { flex: 1, height: 1, background: COLORS.lightGray },

  questionRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    marginBottom: 6,
    transition: "background 0.1s",
  },
  questionNum: {
    width: 28,
    height: 28,
    minWidth: 28,
    borderRadius: "50%",
    background: "#FEF3E2",
    color: COLORS.orange,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    marginTop: 1,
    fontFamily: FONTS.heading,
  },
  questionText: { flex: 1, fontSize: 14, color: COLORS.gray, lineHeight: 1.5, paddingTop: 4 },
  toggleGroup: { display: "flex", gap: 6, marginTop: 4 },
  toggleBtn: (selected, variant) => ({
    padding: "5px 16px",
    borderRadius: 20,
    border: "1.5px solid",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    transition: "all 0.15s",
    fontFamily: FONTS.body,
    borderColor: variant === "Yes"
      ? (selected ? COLORS.green : "#ccc")
      : variant === "No"
        ? (selected ? COLORS.fail : "#ccc")
        : (selected ? COLORS.midGray : "#ccc"), // N/A
    background: variant === "Yes"
      ? (selected ? COLORS.passBg : COLORS.white)
      : variant === "No"
        ? (selected ? COLORS.failBg : COLORS.white)
        : (selected ? "#ECEFF1" : COLORS.white), // N/A
    color: variant === "Yes"
      ? (selected ? COLORS.green : "#999")
      : variant === "No"
        ? (selected ? COLORS.fail : "#999")
        : (selected ? COLORS.gray : "#999"), // N/A
  }),

  scoreBar: {
    margin: "24px 0",
    padding: "16px 20px",
    borderRadius: 10,
    border: "2px solid",
    display: "flex",
    alignItems: "center",
    gap: 20,
  },
  scoreNum: { fontSize: 36, fontWeight: 800, lineHeight: 1, fontFamily: FONTS.heading },
  scoreSub: { fontSize: 12, color: COLORS.midGray, marginTop: 2 },
  scoreBadge: {
    padding: "4px 14px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: FONTS.heading,
  },
  progressTrack: {
    flex: 1,
    height: 10,
    background: "#eee",
    borderRadius: 5,
    overflow: "hidden",
  },

  textarea: {
    width: "100%",
    padding: "10px 12px",
    border: `1.5px solid ${COLORS.lightGray}`,
    borderRadius: 8,
    fontSize: 14,
    resize: "vertical",
    minHeight: 90,
    outline: "none",
    fontFamily: FONTS.body,
    boxSizing: "border-box",
  },

  submitBtn: (disabled) => ({
    display: "block",
    width: "100%",
    padding: "14px",
    marginTop: 24,
    background: disabled ? "#aaa" : GRADIENT.orange,
    color: COLORS.white,
    border: "none",
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    fontFamily: FONTS.heading,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "opacity 0.2s",
  }),

  successBox: {
    textAlign: "center",
    padding: "48px 32px",
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: COLORS.passBg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
    fontSize: 36,
  },
  errorBox: {
    background: COLORS.failBg,
    border: "1px solid #FFCDD2",
    borderRadius: 8,
    padding: "12px 16px",
    color: COLORS.fail,
    fontSize: 14,
    marginTop: 16,
  },
};

function scoreColor(pct) {
  if (pct >= 90) return { border: COLORS.green, text: COLORS.green, bar: COLORS.green, bg: COLORS.passBg };
  if (pct >= 80) return { border: COLORS.green, text: COLORS.green, bar: "#66BB6A", bg: COLORS.passBg };
  if (pct >= 70) return { border: COLORS.orange, text: COLORS.orange, bar: COLORS.clementine, bg: COLORS.warningBg };
  return { border: COLORS.fail, text: COLORS.fail, bar: "#EF5350", bg: COLORS.failBg };
}

// editScreening: a screening from GET /api/screenings/<id>. When given, the
// form edits that screening instead of creating a new one.
export default function QAForm({ prefill, onDone, editScreening = null }) {
  const editing = !!editScreening;
  const { instance, accounts } = useMsal();
  const [accessToken, setAccessToken] = useState(null);

  // Auto-fill evaluator from signed-in user and get access token
  const signedInName = accounts[0]?.name || accounts[0]?.username || "";

  useEffect(() => {
    async function getToken() {
      try {
        const tokenRes = await instance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });
        setAccessToken(tokenRes.accessToken);
      } catch {
        // Token will be acquired on submit if silent fails
      }
    }
    if (accounts[0]) getToken();
  }, [instance, accounts]);

  const [channel, setChannel] = useState(editScreening?.channel || prefill?.channel || "Phone");
  const questions = QA_QUESTIONS_BY_CHANNEL[channel];
  const categories = useMemo(() => [...new Set(questions.map((q) => q.category))], [questions]);

  const initialAnswers = Object.fromEntries(
    questions.map((q) => [q.field, editScreening?.answers?.[q.field] || null])
  );
  const [answers, setAnswers] = useState(initialAnswers);
  const [agentName, setAgentName] = useState(editScreening?.agent_name || prefill?.agentName || "");
  const [agentEmail, setAgentEmail] = useState(editScreening?.agent_email || prefill?.agentEmail || "");
  // The evaluator is whoever is signed in (the QA service records it); when
  // editing, it stays the original evaluator.
  const [evaluatorName, setEvaluatorName] = useState(editScreening?.evaluator_name || signedInName);
  const [suggestions, setSuggestions] = useState(editScreening?.suggestions || "");
  const [attachments, setAttachments] = useState([]); // File[] from <input type="file">
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  // After submit: files that didn't upload, and whether an edit changed anything
  const [uploadWarning, setUploadWarning] = useState(null);
  const [saveChanged, setSaveChanged] = useState(true);

  // Pre-fill context info shown at top of form when coming from an assignment
  // ContactID: pre-fill from assignment if launched from Screen; otherwise let user enter manually.
  const [contactId, setContactId] = useState(editScreening?.contact_id || prefill?.contactId || "");
  const skillName = prefill?.skillName || "";
  const assignmentId = editing ? null : prefill?.assignmentId || null;
  const interactionDate = editScreening?.interaction_date || prefill?.interactionDate || "";

  // Every channel uses the same questions today, so answers carry over
  // instead of being wiped when the evaluator switches channel.
  function handleChannelChange(newChannel) {
    setChannel(newChannel);
    const fields = QA_QUESTIONS_BY_CHANNEL[newChannel].map((q) => q.field);
    setAnswers((prev) => Object.fromEntries(fields.map((f) => [f, prev[f] ?? null])));
  }

  const { totalScore, scorePercent, passFail, answered, naCount, scoredCount } = useMemo(() => {
    const { earned, total, percent } = calculateScore(answers, questions);
    const naCount = questions.filter((q) => answers[q.field] === "N/A").length;
    return {
      totalScore: earned,           // # of Yes answers
      scoredCount: total,           // # of Yes+No (excluding N/A)
      scorePercent: percent,
      passFail: percent >= 80 ? "Pass" : "Fail",
      answered: questions.filter((q) => answers[q.field] !== null).length,
      naCount,
    };
  }, [answers, questions]);

  // Agent email is optional (when screening from an assignment we may only have the name from CXone)
  const allAnswered = answered === questions.length && agentName.trim() && evaluatorName.trim();
  const colors = scoreColor(scorePercent);

  async function doSubmission(accessToken) {
    // 1. Save to the QA service. It scores the answers itself, records the
    //    evaluator from the sign-in, marks the assignment completed, and
    //    keeps a history of edits.
    const body = {
      agentName: agentName.trim(),
      agentEmail: agentEmail.trim(),
      channel,
      contactId: String(contactId || "").trim(),
      interactionDate: interactionDate || null,
      answers,
      suggestions: suggestions.trim(),
    };
    if (assignmentId) body.assignmentId = assignmentId;
    const saved = editing
      ? await updateScreening(editScreening.id, body)
      : await createScreening(body);
    setSaveChanged(!editing || saved.changed !== false);

    // 2. Upload call recordings / files to the saved screening
    const failed = [];
    for (const file of attachments) {
      try {
        await uploadAttachment(saved.id, file);
      } catch (attErr) {
        failed.push(`${file.name}: ${attErr.message}`);
      }
    }
    setUploadWarning(failed.length ? failed : null);

    // 3. Email the agent their score: always for a new screening, and for an
    //    edit only when the score or result changed. Best-effort.
    const scoreChanged = !editing || (saved.changed && (saved.changes?.score_percent || saved.changes?.pass_fail));
    const emailTo = (saved.agent_email || agentEmail).trim();
    if (emailTo && scoreChanged) {
      try {
        await sendScoreEmail(accessToken, {
          agentName: saved.agent_name,
          agentEmail: emailTo,
          evaluatorName: editing ? signedInName : saved.evaluator_name,
          channel: saved.channel,
          scorePercent: saved.score_percent,
          scoreEarned: saved.score_earned,
          scoreTotal: saved.score_total,
          passFail: saved.pass_fail,
          updated: editing,
        });
      } catch (emailErr) {
        console.warn("Score email could not be sent:", emailErr.message);
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);

    try {
      const tokenResponse = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });
      await doSubmission(tokenResponse.accessToken);
      setSubmitted(true);
    } catch (err) {
      if (err.name === "InteractionRequiredAuthError") {
        try {
          const tokenResponse = await instance.acquireTokenPopup(loginRequest);
          await doSubmission(tokenResponse.accessToken);
          setSubmitted(true);
        } catch (popupErr) {
          setError(popupErr.message);
        }
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setChannel("Phone");
    setAnswers(Object.fromEntries(QA_QUESTIONS_BY_CHANNEL.Phone.map((q) => [q.field, null])));
    setAgentName("");
    setAgentEmail("");
    setEvaluatorName(signedInName);
    setSuggestions("");
    setAttachments([]);
    setContactId("");
    setUploadWarning(null);
    setSubmitted(false);
    setError(null);
  }

  if (submitted) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.headerTitle}>Support Quality Assurance</h1>
          </div>
          <div style={styles.successBox}>
            <div style={styles.successCircle}>{"\u2714"}</div>
            <h2 style={{ margin: "0 0 8px", color: COLORS.orange, fontFamily: FONTS.heading }}>{editing ? "Changes Saved" : "Screening Submitted"}</h2>
            <p style={{ color: COLORS.gray, margin: "0 0 8px" }}>
              <strong>{agentName}</strong> {"\u00B7"} {channel} {"\u00B7"} evaluated by <strong>{evaluatorName}</strong>
            </p>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 24px",
                borderRadius: 10,
                background: colors.bg,
                border: `2px solid ${colors.border}`,
                margin: "12px 0 24px",
              }}
            >
              <span style={{ fontSize: 28, fontWeight: 800, color: colors.text, fontFamily: FONTS.heading }}>
                {scorePercent}%
              </span>
              <span
                style={{
                  ...styles.scoreBadge,
                  background: colors.border,
                  color: COLORS.white,
                }}
              >
                {passFail}
              </span>
            </div>

            {editing && !saveChanged && (
              <p style={{ color: COLORS.midGray, fontSize: 13 }}>No changes were made, so nothing was recorded.</p>
            )}
            {uploadWarning && (
              <div style={{
                marginTop: 4, padding: "12px 16px", background: COLORS.warningBg,
                border: `1.5px solid ${COLORS.clementine}`, borderRadius: 8,
                fontSize: 13, textAlign: "left", color: "#795548",
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {"\u26A0"} The screening was saved, but these files didn't upload:
                </div>
                {uploadWarning.map((w) => <div key={w}>{w}</div>)}
                <div style={{ marginTop: 6 }}>Open the screening from the Dashboard and use Edit to try again.</div>
              </div>
            )}
            <br />
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {(assignmentId || editing) && (
                <button
                  onClick={() => onDone && onDone()}
                  style={{
                    padding: "10px 28px",
                    background: COLORS.green,
                    color: COLORS.white,
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: FONTS.heading,
                    cursor: "pointer",
                  }}
                >
                  {editing ? "Done" : "Back to Assignments"}
                </button>
              )}
              {!editing && <button
                onClick={resetForm}
                style={{
                  padding: "10px 28px",
                  background: COLORS.orange,
                  color: COLORS.white,
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: FONTS.heading,
                  cursor: "pointer",
                }}
              >
                Start New Screening
              </button>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.headerTitle}>{editing ? "Edit Screening" : "New Screening"}</h1>
          <p style={styles.headerSub}>
            {channel} {"\u00B7"} 20 criteria {"\u00B7"} Yes / No / N/A {"\u00B7"} N/A excluded from score {"\u00B7"} Pass threshold: 80%
          </p>
        </div>

        <form onSubmit={handleSubmit} style={styles.body}>
          {/* Assignment context banner */}
          {editing && (
            <div style={{
              background: "#EEF6FC", border: `1.5px solid ${COLORS.sky}`, borderRadius: 8,
              padding: "10px 14px", marginBottom: 16, fontSize: 13, color: COLORS.gray,
            }}>
              <strong style={{ color: COLORS.sky }}>Editing a saved screening</strong>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                Every change is recorded with your name and the time.
                {(editScreening.answers && Object.keys(editScreening.answers).length < questions.length) &&
                  " This screening was imported with some answers missing, so please answer every question."}
              </div>
            </div>
          )}
          {contactId && !editing && (
            <div
              style={{
                background: "#FEF3E2",
                border: `1.5px solid ${COLORS.orange}`,
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 16,
                fontSize: 13,
                color: COLORS.gray,
              }}
            >
              <strong style={{ color: COLORS.orange }}>Screening from Assignment</strong>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                Contact ID: <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{contactId}</span>
                {interactionDate ? (
                  <> {"\u00B7"} Date:{" "}
                    <span style={{ fontWeight: 600 }}>
                      {new Date(interactionDate).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </>
                ) : null}
                {skillName ? <> {"\u00B7"} Skill: {skillName}</> : null}
              </div>
            </div>
          )}

          {/* Channel selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={styles.label}>Channel *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => handleChannelChange(ch)}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 20,
                    border: "2px solid",
                    borderColor: channel === ch ? COLORS.orange : COLORS.lightGray,
                    background: channel === ch ? "#FEF3E2" : COLORS.white,
                    color: channel === ch ? COLORS.orange : COLORS.midGray,
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: FONTS.heading,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {/* Agent / Evaluator */}
          <div style={styles.row}>
            <div style={{ ...styles.col, flex: 2 }}>
              <AgentTypeAhead
                label="Agent Name *"
                value={agentName}
                email={agentEmail}
                onChange={(name, email) => { setAgentName(name); setAgentEmail(email); }}
                onSelect={(name, email) => { setAgentName(name); setAgentEmail(email); }}
                placeholder="Type to filter CXone agents..."
              />
            </div>
            <div style={styles.col}>
              <label style={styles.label}>Evaluator</label>
              <input
                style={{ ...styles.input, background: "#F5F5F5", color: COLORS.midGray }}
                value={evaluatorName}
                readOnly
                tabIndex={-1}
              />
            </div>
          </div>

          {/* Contact ID */}
          <div style={styles.row}>
            <div style={styles.col}>
              <label style={styles.label}>
                Contact ID
                {prefill?.contactId ? null : (
                  <span style={{ color: COLORS.midGray, fontWeight: 400, marginLeft: 6 }}>
                    (from NICE — optional for one-off screenings)
                  </span>
                )}
              </label>
              <input
                style={{
                  ...styles.input,
                  fontFamily: "monospace",
                  // Show as read-only when prefilled from an assignment
                  ...(prefill?.contactId
                    ? { background: "#F5F5F5", color: COLORS.midGray }
                    : {}),
                }}
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                readOnly={!!prefill?.contactId}
                placeholder="e.g. 700729094675"
              />
            </div>
          </div>

          {/* Live score bar */}
          {answered > 0 && (
            <div style={{ ...styles.scoreBar, borderColor: colors.border, background: colors.bg }}>
              <div>
                <div style={{ ...styles.scoreNum, color: colors.text }}>{scorePercent}%</div>
                <div style={styles.scoreSub}>
                  {totalScore} of {scoredCount} scored {"\u00B7"} {answered}/{questions.length} answered
                  {naCount > 0 ? <> {"\u00B7"} {naCount} N/A excluded</> : null}
                </div>
              </div>
              <div style={styles.progressTrack}>
                <div
                  style={{
                    height: "100%",
                    width: `${scorePercent}%`,
                    background: colors.bar,
                    borderRadius: 5,
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <span
                style={{
                  ...styles.scoreBadge,
                  background: colors.border,
                  color: COLORS.white,
                }}
              >
                {passFail}
              </span>
            </div>
          )}

          {/* Questions grouped by category */}
          {categories.map((cat) => {
            const qs = questions.filter((q) => q.category === cat);
            return (
              <div key={cat}>
                <div style={styles.sectionHeader}>
                  <span style={styles.sectionPill}>{cat}</span>
                  <div style={styles.sectionLine} />
                </div>
                {qs.map((q, idx) => {
                  const globalIdx = questions.findIndex((x) => x.field === q.field);
                  const isEven = globalIdx % 2 === 0;
                  return (
                    <div
                      key={q.field}
                      style={{
                        ...styles.questionRow,
                        background: isEven ? "#FEF9F3" : COLORS.white,
                      }}
                    >
                      <div style={styles.questionNum}>{globalIdx + 1}</div>
                      <div style={{ ...styles.questionText }}>
                        <div style={{ fontWeight: 600 }}>{q.label}</div>
                        {q.description && (
                          <div style={{ fontSize: 12, color: COLORS.midGray, marginTop: 4 }}>
                            {q.description}
                          </div>
                        )}
                        <div style={styles.toggleGroup}>
                          {["Yes", "No", "N/A"].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              style={styles.toggleBtn(answers[q.field] === opt, opt)}
                              onClick={() =>
                                setAnswers((prev) => ({ ...prev, [q.field]: opt }))
                              }
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Suggestions */}
          <div style={{ marginTop: 24 }}>
            <label style={styles.label}>Suggestions for Improvement</label>
            <textarea
              style={styles.textarea}
              value={suggestions}
              onChange={(e) => setSuggestions(e.target.value)}
              placeholder="Optional — specific feedback for the agent..."
            />
          </div>

          {/* Attachments */}
          <div style={{ marginTop: 20 }}>
            <label style={styles.label}>Attachments (call recording, transcript, etc.)</label>
            {editing && (editScreening.attachments || []).length > 0 && (
              <div style={{ fontSize: 12, color: COLORS.midGray, marginBottom: 6 }}>
                Already attached: {editScreening.attachments.map((a) => a.filename).join(", ")}
              </div>
            )}
            <input
              type="file"
              multiple
              accept="audio/*,video/*,image/*,application/pdf,text/plain"
              onChange={(e) => setAttachments(Array.from(e.target.files || []))}
              style={{
                display: "block",
                width: "100%",
                padding: "10px 12px",
                border: `1.5px dashed ${COLORS.lightGray}`,
                borderRadius: 8,
                fontSize: 13,
                background: COLORS.offWhite,
                fontFamily: FONTS.body,
                cursor: "pointer",
                boxSizing: "border-box",
              }}
            />
            {attachments.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: COLORS.midGray }}>
                {attachments.length} file{attachments.length > 1 ? "s" : ""} selected:{" "}
                {attachments.map((f) => f.name).join(", ")}
              </div>
            )}
          </div>

          {/* Error */}
          {error && <div style={styles.errorBox}>{"\u26A0\uFE0F"} {error}</div>}

          {/* Unanswered warning */}
          {answered < questions.length && answered > 0 && (
            <div
              style={{
                background: COLORS.warningBg,
                border: `1px solid ${COLORS.clementine}`,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                color: "#795548",
                marginTop: 16,
              }}
            >
              {questions.length - answered} question
              {questions.length - answered > 1 ? "s" : ""} still need an answer before submitting.
            </div>
          )}

          <button type="submit" style={styles.submitBtn(!allAnswered || submitting)} disabled={!allAnswered || submitting}>
            {submitting ? "Saving\u2026" : editing ? "Save Changes" : "Submit Screening"}
          </button>
        </form>
      </div>
    </div>
  );
}
