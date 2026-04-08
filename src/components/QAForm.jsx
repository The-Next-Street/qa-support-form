import React, { useState, useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "../authConfig";
import { submitQARecord, sendScoreEmail } from "../sharepointService";
import { QA_QUESTIONS_BY_CHANNEL, CHANNELS } from "../questions";
import { COLORS, FONTS, GRADIENT } from "../brand";

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
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  header: {
    background: GRADIENT.orange,
    padding: "28px 32px",
    color: COLORS.white,
  },
  headerTitle: { margin: 0, fontSize: 24, fontWeight: 700, fontFamily: FONTS.heading },
  headerSub: { margin: "6px 0 0", fontSize: 14, color: "rgba(255,255,255,0.8)" },
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
      : (selected ? COLORS.fail : "#ccc"),
    background: variant === "Yes"
      ? (selected ? COLORS.passBg : COLORS.white)
      : (selected ? COLORS.failBg : COLORS.white),
    color: variant === "Yes"
      ? (selected ? COLORS.green : "#999")
      : (selected ? COLORS.fail : "#999"),
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

export default function QAForm() {
  const { instance, accounts } = useMsal();

  const [channel, setChannel] = useState("Phone");
  const questions = QA_QUESTIONS_BY_CHANNEL[channel];
  const categories = useMemo(() => [...new Set(questions.map((q) => q.category))], [questions]);

  const initialAnswers = Object.fromEntries(questions.map((q) => [q.field, null]));
  const [answers, setAnswers] = useState(initialAnswers);
  const [agentName, setAgentName] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [evaluatorName, setEvaluatorName] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  function handleChannelChange(newChannel) {
    setChannel(newChannel);
    setAnswers(Object.fromEntries(QA_QUESTIONS_BY_CHANNEL[newChannel].map((q) => [q.field, null])));
  }

  const { totalScore, scorePercent, passFail, answered } = useMemo(() => {
    const yesCount = questions.filter((q) => answers[q.field] === "Yes").length;
    const total = yesCount * 5;
    const pct = total;
    return {
      totalScore: total,
      scorePercent: pct,
      passFail: pct >= 80 ? "Pass" : "Fail",
      answered: questions.filter((q) => answers[q.field] !== null).length,
    };
  }, [answers, questions]);

  const allAnswered = answered === questions.length && agentName.trim() && agentEmail.trim() && evaluatorName.trim();
  const colors = scoreColor(scorePercent);

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

      await submitQARecord(tokenResponse.accessToken, {
        ...answers,
        AgentName: agentName.trim(),
        AgentEmail: agentEmail.trim(),
        EvaluatorName: evaluatorName.trim(),
        Channel: channel,
        SuggestionsForImprovement: suggestions.trim(),
        TotalScore: totalScore,
        ScorePercent: scorePercent,
        PassFail: passFail,
      });

      try {
        await sendScoreEmail(tokenResponse.accessToken, {
          agentName: agentName.trim(),
          agentEmail: agentEmail.trim(),
          evaluatorName: evaluatorName.trim(),
          channel,
          scorePercent,
          totalScore,
          passFail,
        });
      } catch (emailErr) {
        console.warn("Score email could not be sent:", emailErr.message);
      }

      setSubmitted(true);
    } catch (err) {
      if (err.name === "InteractionRequiredAuthError") {
        try {
          const tokenResponse = await instance.acquireTokenPopup(loginRequest);
          await submitQARecord(tokenResponse.accessToken, {
            ...answers,
            AgentName: agentName.trim(),
            AgentEmail: agentEmail.trim(),
            EvaluatorName: evaluatorName.trim(),
            Channel: channel,
            SuggestionsForImprovement: suggestions.trim(),
            TotalScore: totalScore,
            ScorePercent: scorePercent,
            PassFail: passFail,
          });

          try {
            await sendScoreEmail(tokenResponse.accessToken, {
              agentName: agentName.trim(),
              agentEmail: agentEmail.trim(),
              evaluatorName: evaluatorName.trim(),
              channel,
              scorePercent,
              totalScore,
              passFail,
            });
          } catch (emailErr) {
            console.warn("Score email could not be sent:", emailErr.message);
          }

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
    setEvaluatorName("");
    setSuggestions("");
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
            <h2 style={{ margin: "0 0 8px", color: COLORS.orange, fontFamily: FONTS.heading }}>Screening Submitted</h2>
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
            <br />
            <button
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
            </button>
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
          <h1 style={styles.headerTitle}>Support Quality Assurance</h1>
          <p style={styles.headerSub}>
            {channel} {"\u00B7"} 20 criteria {"\u00B7"} 5 points each {"\u00B7"} 100 points max {"\u00B7"} Pass threshold: 80%
          </p>
        </div>

        <form onSubmit={handleSubmit} style={styles.body}>
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
            <div style={styles.col}>
              <label style={styles.label}>Agent Name *</label>
              <input
                style={styles.input}
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
            <div style={styles.col}>
              <label style={styles.label}>Agent Email *</label>
              <input
                style={styles.input}
                type="email"
                value={agentEmail}
                onChange={(e) => setAgentEmail(e.target.value)}
                placeholder="agent@thenextstreet.com"
                required
              />
            </div>
            <div style={styles.col}>
              <label style={styles.label}>Evaluator Name *</label>
              <input
                style={styles.input}
                value={evaluatorName}
                onChange={(e) => setEvaluatorName(e.target.value)}
                placeholder="Your full name"
                required
              />
            </div>
          </div>

          {/* Live score bar */}
          {answered > 0 && (
            <div style={{ ...styles.scoreBar, borderColor: colors.border, background: colors.bg }}>
              <div>
                <div style={{ ...styles.scoreNum, color: colors.text }}>{scorePercent}%</div>
                <div style={styles.scoreSub}>
                  {totalScore} / 100 pts {"\u00B7"} {answered}/{questions.length} answered
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
                        {q.label}
                        <div style={styles.toggleGroup}>
                          {["Yes", "No"].map((opt) => (
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
            {submitting ? "Submitting\u2026" : "Submit Screening"}
          </button>
        </form>
      </div>
    </div>
  );
}
