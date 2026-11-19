// Score emails to agents, sent from the evaluator's own Outlook mailbox
// through Microsoft Graph (Mail.Send). QA data itself lives in the QA
// service; this is the only Microsoft 365 call made when a screening is saved.

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/**
 * Sends the agent an email with their QA screening score via Microsoft Graph.
 * @param {string} accessToken - Bearer token from MSAL (needs Mail.Send scope)
 * @param {object} scoreData   - { agentName, agentEmail, evaluatorName, scorePercent, totalScore, passFail }
 */
export async function sendScoreEmail(accessToken, scoreData) {
  const {
    agentName, agentEmail, evaluatorName, channel = "Phone",
    scorePercent, scoreEarned, scoreTotal, passFail, updated = false,
  } = scoreData;

  const passColor = passFail === "Pass" ? "#73BF45" : "#C62828";
  const passBg    = passFail === "Pass" ? "#EEF8E5" : "#FFEBEE";

  const htmlBody = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#F58A21,#E07010);padding:24px 28px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:20px;">QA Screening Results</h2>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">The Next Street &middot; Customer Service</p>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #e8e8e8;border-top:none;border-radius:0 0 12px 12px;">
        <p style="color:#3B3B3B;font-size:15px;margin:0 0 16px;">
          Hi <strong>${esc(agentName)}</strong>,
        </p>
        <p style="color:#888;font-size:14px;margin:0 0 20px;">
          ${updated
            ? `Your QA screening for <strong style="color:#3B3B3B;">${esc(channel)}</strong> was <strong style="color:#3B3B3B;">updated</strong> by <strong style="color:#3B3B3B;">${esc(evaluatorName)}</strong>. Here are your updated results:`
            : `A QA screening for <strong style="color:#3B3B3B;">${esc(channel)}</strong> was completed for you by <strong style="color:#3B3B3B;">${esc(evaluatorName)}</strong>. Here are your results:`}
        </p>
        <div style="text-align:center;padding:20px;border-radius:10px;background:${passBg};border:2px solid ${passColor};margin:0 0 20px;">
          <div style="font-size:42px;font-weight:800;color:${passColor};">${scorePercent}%</div>
          <div style="font-size:13px;color:#888;margin:4px 0 10px;">${scoreEarned} of ${scoreTotal} scored questions met</div>
          <span style="display:inline-block;padding:5px 18px;border-radius:20px;background:${passColor};color:#fff;font-size:14px;font-weight:700;">
            ${passFail}
          </span>
        </div>
        <p style="color:#888;font-size:12px;margin:0;">
          If you have questions about this screening, please reach out to your supervisor.
        </p>
      </div>
    </div>
  `;

  const message = {
    message: {
      subject: `${updated ? "Updated " : ""}QA Screening Result (${channel}): ${passFail} (${scorePercent}%)`,
      body: {
        contentType: "HTML",
        content: htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: agentEmail,
          },
        },
      ],
    },
    saveToSentItems: false,
  };

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email send error ${response.status}: ${errorText}`);
  }
}
