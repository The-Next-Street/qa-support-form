import { runSharePointImport } from "./sharepointImport";
import { importFromSharePoint } from "./qaApi";

// The project's Jest setup resets mock behaviour before every test, so the
// stand-in's behaviour is set in beforeEach.
jest.mock("./qaApi", () => ({ importFromSharePoint: jest.fn() }));

const LIST_IDS = {
  "Support Quality Assurance": "L-SCREEN",
  QA_Assignments: "L-ASSIGN",
  "QA EvaluatorAgents": "L-PAIRS",
};

function ok(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve("") });
}

beforeEach(() => {
  importFromSharePoint.mockResolvedValue({
    counts: {
      screenings: { imported: 2, skipped: 0 },
      assignments: { imported: 1, skipped: 0 },
      pairs: { imported: 1, skipped: 0 },
    },
  });
  global.fetch = jest.fn((url) => {
    const u = decodeURIComponent(url);
    const listMatch = u.match(/displayName eq '([^']+)'/);
    if (listMatch) return ok({ value: [{ id: LIST_IDS[listMatch[1]] }] });
    if (u.includes("/lists/L-SCREEN/items") && !u.includes("page=2")) {
      return ok({
        value: [{
          id: 11, createdDateTime: "2026-07-01T12:00:00Z",
          fields: {
            AgentName: "Ed Green", EvaluatorName: "Susannah Y", Channel: "Phone", ContactID: 555,
            DateOfInteraction: "2026-06-30T15:00:00Z", ScorePercent: 41, PassFail: "Fail",
            Q06_x005f_Greeting: "Yes", Q24_Compliance: "No", SuggestionsForImprovement: "Slow down",
          },
        }],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/next?page=2",
      });
    }
    if (u.includes("page=2")) {
      return ok({ value: [{ id: 12, fields: { Agent: "Lisa Gilmore", ScorePercent: 95, Created: "2026-07-02T10:00:00Z" } }] });
    }
    if (u.includes("/lists/L-ASSIGN/items")) {
      return ok({ value: [{ id: 21, fields: {
        Evaluator: "Susannah Y", Agent: "Ed Green", ContactId: "555", Channel: "Chat",
        WeekOf: "2026-06-29T00:00:00Z", Duration: 240, Status: "Completed",
      } }] });
    }
    if (u.includes("/lists/L-PAIRS/items")) {
      return ok({ value: [
        { id: 31, fields: { EvaluatorLookupId: "7", AgentLookupId: "8" } },
        { id: 32, fields: { EvaluatorLookupId: "7", AgentLookupId: "8", Active: false } },
      ] });
    }
    if (u.includes("User Information List")) {
      const id = u.match(/items\/(\d+)/)[1];
      return ok({ fields: id === "7"
        ? { Title: "Susannah Y", EMail: "s@example.com" }
        : { Title: "Ed Green", EMail: "ed@example.com" } });
    }
    throw new Error(`unexpected fetch ${u}`);
  });
});

test("reads every page of every list and maps it for the QA service", async () => {
  const progress = [];
  const result = await runSharePointImport("graph-token", (m) => progress.push(m));

  expect(result.read).toEqual({ screenings: 2, assignments: 1, pairs: 1 });
  expect(progress.length).toBeGreaterThan(2);
  const payload = importFromSharePoint.mock.calls[0][0];

  // Follows paging past the first page
  expect(payload.screenings.map((x) => x.sharepointId)).toEqual(["11", "12"]);
  const first = payload.screenings[0];
  expect(first).toMatchObject({
    agentName: "Ed Green", evaluatorName: "Susannah Y", channel: "Phone", contactId: "555",
    interactionDate: "2026-06-30T15:00:00.000Z", submittedAt: "2026-07-01T12:00:00.000Z",
    scorePercent: 41, passFail: "Fail", suggestions: "Slow down",
  });
  // Encoded column names still map to the right questions
  expect(first.answers).toEqual({ Greeting: "Yes", Compliance: "No" });
  // "Agent" column fallback, Created as submitted date
  expect(payload.screenings[1]).toMatchObject({ agentName: "Lisa Gilmore", channel: "Phone" });

  expect(payload.assignments[0]).toMatchObject({
    sharepointId: "21", weekOf: "2026-06-29", agentName: "Ed Green", channel: "Chat",
    durationSeconds: 240, status: "Completed",
  });
  // Person columns resolved; inactive pairing skipped
  expect(payload.pairs).toEqual([{
    sharepointId: "31", evaluatorName: "Susannah Y", evaluatorEmail: "s@example.com",
    agentName: "Ed Green", agentEmail: "ed@example.com",
  }]);
  // Every Graph call carries the token
  for (const call of global.fetch.mock.calls) {
    expect(call[1].headers.Authorization).toBe("Bearer graph-token");
  }
});

test("a SharePoint error stops the import before anything is saved", async () => {
  importFromSharePoint.mockClear();
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve("denied") }));
  await expect(runSharePointImport("t")).rejects.toThrow("SharePoint read failed (403)");
  expect(importFromSharePoint).not.toHaveBeenCalled();
});
