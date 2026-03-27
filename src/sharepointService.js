import { sharepointConfig } from "./authConfig";

/**
 * Posts a new QA screening record to the SharePoint list.
 * @param {string} accessToken  - Bearer token from MSAL
 * @param {object} formData     - The form values to save
 */
export async function submitQARecord(accessToken, formData) {
  const { siteUrl, listName } = sharepointConfig;
  const endpoint = `${siteUrl}/_api/web/lists/getbytitle('${listName}')/items`;

  // Build the SharePoint item payload.
  // Choice field values are sent as plain strings ("Yes" / "No").
  const payload = {
    __metadata: { type: "SP.Data.QA_SupportPhonesListItem" },

    // Identification fields
    AgentName:    formData.AgentName,
    EvaluatorName: formData.EvaluatorName,
    SubmissionDate: new Date().toISOString(),

    // 20 QA question fields (Choice: Yes / No)
    Q06: formData.Q06,
    Q07: formData.Q07,
    Q08: formData.Q08,
    Q09: formData.Q09,
    Q10: formData.Q10,
    Q11: formData.Q11,
    Q12: formData.Q12,
    Q13: formData.Q13,
    Q14: formData.Q14,
    Q15: formData.Q15,
    Q16: formData.Q16,
    Q17: formData.Q17,
    Q18: formData.Q18,
    Q19: formData.Q19,
    Q20: formData.Q20,
    Q21: formData.Q21,
    Q22: formData.Q22,
    Q23: formData.Q23,
    Q24: formData.Q24,
    Q25: formData.Q25,

    // Calculated score fields
    TotalScore:   formData.TotalScore,
    ScorePercent: formData.ScorePercent,
    PassFail:     formData.PassFail,

    // Open text
    SuggestionsForImprovement: formData.SuggestionsForImprovement || "",
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SharePoint error ${response.status}: ${errorText}`);
  }

  return await response.json();
}
