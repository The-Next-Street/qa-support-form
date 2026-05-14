import { sharepointConfig } from "./authConfig";
import { FIELD_TO_SP_COLUMN } from "./questions";

const GRAPH_SITE =
  "allstardriver.sharepoint.com:/sites/ServiceExcellenceDepartment-ALL-CustomerServiceTeam:";

// Cache of detected internal column names per list (avoids re-fetching schema every submit)
const _columnNameCache = {};

// Normalize a field name for matching: lowercase, strip non-alphanumerics
function _norm(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Discover internal column names by querying the list's column schema.
 * Returns a map of "normalized-name" → "actual-internal-name".
 */
async function detectColumnNames(accessToken, listName) {
  if (_columnNameCache[listName]) return _columnNameCache[listName];

  // Prefer the columns endpoint (works even when the list is empty)
  let actualNames = [];
  const colsEndpoint =
    `https://graph.microsoft.com/v1.0/sites/${GRAPH_SITE}/lists/${encodeURIComponent(listName)}/columns?$select=name,displayName,readOnly`;
  try {
    const res = await fetch(colsEndpoint, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    if (res.ok) {
      const body = await res.json();
      // Each column has both `name` (internal) and `displayName`. Use both as keys.
      for (const col of body.value || []) {
        if (col.readOnly) continue;
        if (col.name) actualNames.push({ key: col.name, internal: col.name });
        if (col.displayName && col.displayName !== col.name) {
          actualNames.push({ key: col.displayName, internal: col.name });
        }
      }
    }
  } catch (_) {
    // fall through to item-based detection
  }

  // Also try item-based detection as a fallback / supplement
  if (actualNames.length === 0) {
    try {
      const itemsEndpoint =
        `https://graph.microsoft.com/v1.0/sites/${GRAPH_SITE}/lists/${encodeURIComponent(listName)}/items` +
        `?$expand=fields&$top=1`;
      const res = await fetch(itemsEndpoint, {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const body = await res.json();
        const sample = body?.value?.[0]?.fields || {};
        for (const k of Object.keys(sample)) {
          if (k.startsWith("@") || k.startsWith("_")) continue;
          actualNames.push({ key: k, internal: k });
        }
      }
    } catch (_) {
      // ignore
    }
  }

  // Build normalized-name → actual-internal-name map
  const normToActual = {};
  for (const { key, internal } of actualNames) {
    const n = _norm(key);
    if (!normToActual[n]) normToActual[n] = internal;
  }
  _columnNameCache[listName] = normToActual;
  return normToActual;
}

/**
 * Posts a new QA screening record to the SharePoint list via Microsoft Graph.
 * @param {string} accessToken  - Bearer token from MSAL (Sites.ReadWrite.All scope)
 * @param {object} formData     - The form values to save
 */
export async function submitQARecord(accessToken, formData) {
  const { listName } = sharepointConfig;

  // Build the desired payload — use the SharePoint column names that exist on
  // the Support Quality Assurance list. Auto-detect handles aliasing.
  const desired = {
    Agent: formData.AgentName,           // SharePoint column is "Agent"
    AgentName: formData.AgentName,        // also send under AgentName in case the column is named that
    AgentEmail: formData.AgentEmail,
    Evaluator: formData.EvaluatorName,    // SharePoint column may be "Evaluator"
    EvaluatorName: formData.EvaluatorName,
    Channel: formData.Channel || "Phone",
    SubmissionDate: new Date().toISOString(),

    TotalScore: formData.TotalScore,
    ScorePercent: formData.ScorePercent,
    PassFail: formData.PassFail,

    SuggestionsForImprovement: formData.SuggestionsForImprovement || "",
  };

  // Add each QA question answer under its SharePoint column display name
  for (const [reactField, spColumnName] of Object.entries(FIELD_TO_SP_COLUMN)) {
    if (formData[reactField] !== undefined && formData[reactField] !== null) {
      desired[spColumnName] = formData[reactField];
    }
  }

  if (formData.ContactId) {
    desired.ContactID = String(formData.ContactId);     // SharePoint column is ContactID (uppercase D)
    desired.ContactId = String(formData.ContactId);     // fallback alias
  }
  if (formData.InteractionDate) {
    const iso = new Date(formData.InteractionDate).toISOString();
    desired.DateOfInteraction = iso;                    // SharePoint column is DateOfInteraction
    desired.InteractionDate = iso;                      // fallback alias
  }

  // Map "desired" names to the actual internal names that exist on the list.
  // Match case-insensitively after stripping non-alphanumerics so
  // "Active Listening" matches "ActiveListening" or "Active_x0020_Listening".
  const normToActual = await detectColumnNames(accessToken, listName);
  const fields = {};
  for (const [key, value] of Object.entries(desired)) {
    if (value === undefined || value === null) continue;
    const actual = normToActual[_norm(key)] || key;
    fields[actual] = value;
  }

  const endpoint =
    `https://graph.microsoft.com/v1.0/sites/${GRAPH_SITE}/lists/${encodeURIComponent(listName)}/items`;

  async function tryPost(payloadFields) {
    return fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: payloadFields }),
    });
  }

  // Recover from "Field 'X' is not recognized" by dropping that field and retrying.
  // Track what gets dropped so we can surface a warning to the user.
  const droppedFields = [];
  let response = await tryPost(fields);
  let attempts = 0;
  while (!response.ok && attempts < 25) {
    const errText = await response.text();
    const match = errText.match(/Field '([^']+)' is not recognized/i);
    if (!match) {
      const detectedKeys = Object.values(normToActual).slice(0, 30).join(", ");
      throw new Error(
        `Graph error ${response.status}: ${errText}\n\nDetected SharePoint columns: ${detectedKeys || "(none)"}`
      );
    }
    const badField = match[1];
    const keyToDrop = Object.keys(fields).find((k) => k.toLowerCase() === badField.toLowerCase());
    if (!keyToDrop) {
      const detectedKeys = Object.values(normToActual).slice(0, 30).join(", ");
      throw new Error(
        `Graph error ${response.status}: ${errText}\n\nDetected SharePoint columns: ${detectedKeys || "(none)"}`
      );
    }
    droppedFields.push(keyToDrop);
    delete fields[keyToDrop];
    attempts += 1;
    response = await tryPost(fields);
  }

  if (!response.ok) {
    const errorText = await response.text();
    const detectedKeys = Object.values(normToActual).slice(0, 30).join(", ");
    throw new Error(
      `Graph error ${response.status}: ${errorText}\n\nDetected SharePoint columns: ${detectedKeys || "(none)"}`
    );
  }

  const body = await response.json();
  // Stash the diagnostic info so QAForm can show a warning AND so we can console.log it for debugging
  if (droppedFields.length > 0) {
    console.warn("[QA submit] Dropped fields (not in SharePoint):", droppedFields);
    console.info("[QA submit] All detected SharePoint columns:", Object.values(normToActual).sort());
  }
  return {
    ...body.fields,
    Id: body.id,
    _droppedFields: droppedFields,
    _detectedColumns: Object.values(normToActual).sort(),
  };
}

/**
 * Uploads files as SharePoint list-item attachments.
 * Uses the SharePoint REST API since Graph's attachments support is limited for lists.
 * @param {string} accessToken
 * @param {number} itemId         - List item ID returned from submitQARecord
 * @param {File[]} files          - Array of File objects from an <input type="file"> element
 */
export async function uploadAttachments(accessToken, itemId, files) {
  if (!itemId || !files || files.length === 0) return;
  const { siteUrl, listName } = sharepointConfig;

  for (const file of files) {
    // Encode the filename for the URL
    const safeName = encodeURIComponent(file.name);
    const endpoint =
      `${siteUrl}/_api/web/lists/getbytitle('${encodeURIComponent(listName)}')` +
      `/items(${itemId})/AttachmentFiles/add(FileName='${safeName}')`;

    const buffer = await file.arrayBuffer();

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json;odata=verbose",
      },
      body: buffer,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Attachment upload failed (${file.name}): ${res.status} ${text}`);
    }
  }
}

/**
 * Marks a QA_Assignments list item as Completed by patching its Status field
 * via Microsoft Graph. Returns silently if the Status column doesn't exist.
 * @param {string} accessToken
 * @param {string} assignmentItemId  - SharePoint list item ID from Assignments list
 */
export async function markAssignmentCompleted(accessToken, assignmentItemId) {
  if (!assignmentItemId) return;
  const { assignmentsListName } = sharepointConfig;
  const GRAPH_SITE =
    "allstardriver.sharepoint.com:/sites/ServiceExcellenceDepartment-ALL-CustomerServiceTeam:";

  // Resolve list id by display name (matches the pattern in Assignments.jsx)
  const listsRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${GRAPH_SITE}/lists?$filter=displayName eq '${assignmentsListName}'`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listsRes.ok) return;
  const listsData = await listsRes.json();
  const listId = listsData?.value?.[0]?.id;
  if (!listId) return;

  await fetch(
    `https://graph.microsoft.com/v1.0/sites/${GRAPH_SITE}/lists/${listId}/items/${assignmentItemId}/fields`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Status: "Completed" }),
    }
  );
  // Ignore errors — Status column may not exist, which is fine.
}

/**
 * Sends the agent an email with their QA screening score via Microsoft Graph.
 * @param {string} accessToken - Bearer token from MSAL (needs Mail.Send scope)
 * @param {object} scoreData   - { agentName, agentEmail, evaluatorName, scorePercent, totalScore, passFail }
 */
export async function sendScoreEmail(accessToken, scoreData) {
  const { agentName, agentEmail, evaluatorName, channel = "Phone", scorePercent, totalScore, passFail } = scoreData;

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
          Hi <strong>${agentName}</strong>,
        </p>
        <p style="color:#888;font-size:14px;margin:0 0 20px;">
          A QA screening for <strong style="color:#3B3B3B;">${channel}</strong> was completed for you by <strong style="color:#3B3B3B;">${evaluatorName}</strong>. Here are your results:
        </p>
        <div style="text-align:center;padding:20px;border-radius:10px;background:${passBg};border:2px solid ${passColor};margin:0 0 20px;">
          <div style="font-size:42px;font-weight:800;color:${passColor};">${scorePercent}%</div>
          <div style="font-size:13px;color:#888;margin:4px 0 10px;">${totalScore} / 100 points</div>
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
      subject: `QA Screening Result (${channel}): ${passFail} (${scorePercent}%)`,
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
