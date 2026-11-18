import { defaultTeam, nameKey, teamLabel, toRecord, qaJson } from "./qaApi";
import { msalInstance } from "./msalInstance";

// The project's Jest setup resets mock behaviour before every test, so the
// sign-in stand-in's behaviour is set in beforeEach.
jest.mock("./msalInstance", () => ({
  msalInstance: { getActiveAccount: jest.fn(), getAllAccounts: jest.fn(), acquireTokenSilent: jest.fn() },
}));

beforeEach(() => {
  msalInstance.getActiveAccount.mockReturnValue({ username: "eva@example.com" });
  msalInstance.getAllAccounts.mockReturnValue([]);
  msalInstance.acquireTokenSilent.mockImplementation(
    async ({ forceRefresh }) => ({ idToken: forceRefresh ? "fresh" : "cached" })
  );
});

test("team defaults match the QA service's teams.py", () => {
  for (const name of ["Lisa Gilmore", " lisa  FARNSWORTH ", "Melissa Hart", "Jodi Park", "Stacie Long", "Caitlyn Moore"]) {
    expect(defaultTeam(name)).toBe("internal_support");
  }
  for (const name of ["Lisa Smith", "Ed Green", "", null]) {
    expect(defaultTeam(name)).toBe("customer_support");
  }
  expect(nameKey("  Ed   GREEN ")).toBe("ed green");
});

test("unknown team values get a neutral label instead of breaking", () => {
  expect(teamLabel("customer_support")).toBe("Customer Support");
  expect(teamLabel("internal_support")).toBe("Internal Support");
  expect(teamLabel("sales")).toBe("Other");
  expect(teamLabel(undefined)).toBe("Other");
});

test("toRecord maps an API screening to the dashboard shape", () => {
  const r = toRecord({
    id: 5, agent_name: "Ed Green", evaluator_name: "Eva", channel: "Chat", contact_id: "C1",
    score_percent: 85, pass_fail: "Pass", interaction_date: "2026-11-10T15:00:00+00:00",
    submitted_at: "2026-11-11T09:00:00+00:00", answers: { Greeting: "Yes" }, team: "internal_support",
    can_edit: true, updated_at: "2026-11-12T00:00:00+00:00", imported: false,
  });
  expect(r).toMatchObject({
    id: 5, agentName: "Ed Green", channel: "Chat", scorePercent: 85, passFail: "Pass",
    team: "internal_support", canEdit: true, edited: true, imported: false,
  });
  expect(r.date.toISOString()).toBe("2026-11-10T15:00:00.000Z");
  // Falls back to the submitted date and default team
  const r2 = toRecord({ id: 6, submitted_at: "2026-11-11T09:00:00Z" });
  expect(r2.date.toISOString()).toBe("2026-11-11T09:00:00.000Z");
  expect(r2.team).toBe("customer_support");
  expect(r2.passFail).toBe("Fail");
});

test("qaJson sends the Microsoft sign-in, retries once on 401, and surfaces the service's error", async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "expired" }) })
    .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "Only managers can do this" }) });
  await expect(qaJson("/api/agents/1", { method: "PUT", body: { team: "internal_support" } }))
    .rejects.toThrow("Only managers can do this");
  const [first, second] = global.fetch.mock.calls;
  expect(first[0]).toBe("https://support-qa-64ne.onrender.com/api/agents/1");
  expect(first[1].headers.Authorization).toBe("Bearer cached");
  expect(second[1].headers.Authorization).toBe("Bearer fresh");
  expect(first[1].headers["Content-Type"]).toBe("application/json");
  expect(JSON.parse(first[1].body)).toEqual({ team: "internal_support" });
  expect(msalInstance.acquireTokenSilent).toHaveBeenCalledTimes(2);
});
