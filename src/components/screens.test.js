import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./Dashboard";
import ScreeningDetail from "./ScreeningDetail";
import QAForm from "./QAForm";
import ManagerReview from "./ManagerReview";
import Settings from "./Settings";
import * as api from "../qaApi";
import { QA_QUESTIONS } from "../questions";

jest.mock("@azure/msal-react", () => ({
  useMsal: () => ({
    instance: { acquireTokenSilent: async () => ({ accessToken: "graph" }) },
    accounts: [{ name: "Eva Evaluator", username: "eva@example.com" }],
  }),
}));
jest.mock("../emailService", () => ({ sendScoreEmail: jest.fn() }));
jest.mock("../qaApi", () => {
  const actual = jest.requireActual("../qaApi");
  return {
    ...actual,
    qaFetch: jest.fn(),
    listScreenings: jest.fn(),
    listAgents: jest.fn(),
    getScreening: jest.fn(),
    updateScreening: jest.fn(),
    createScreening: jest.fn(),
    uploadAttachment: jest.fn(),
    updateAgent: jest.fn(),
    listEvaluatorPairs: jest.fn(),
  };
});
jest.mock("../msalInstance", () => ({ msalInstance: {} }));

global.IS_REACT_ACT_ENVIRONMENT = true;
const allYes = Object.fromEntries(QA_QUESTIONS.map((q) => [q.field, "Yes"]));

function screening(over) {
  return {
    id: 1, agent_name: "Ed Green", agent_email: "ed@example.com", evaluator_name: "Eva Evaluator",
    channel: "Phone", contact_id: "C1", interaction_date: "2026-11-10T15:00:00+00:00",
    submitted_at: "2026-11-11T09:00:00+00:00", answers: allYes, score_earned: 20, score_total: 20,
    score_percent: 100, pass_fail: "Pass", suggestions: "", team: "customer_support",
    can_edit: true, updated_at: null, imported: false, ...over,
  };
}

let container, root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  api.qaFetch.mockResolvedValue({ ok: true, json: async () => ({ agents: [] }) });
  api.listAgents.mockResolvedValue({ agents: [{ name: "Lisa Gilmore", team: "internal_support" }] });
  api.listScreenings.mockResolvedValue({
    screenings: [
      screening({ id: 1, agent_name: "Ed Green" }),
      screening({ id: 2, agent_name: "Lisa Gilmore", team: "internal_support", score_percent: 60, pass_fail: "Fail" }),
    ],
    truncated: false,
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
// Buttons first, so a tab wins over a label with the same text.
const byText = (text) => [...container.querySelectorAll("button"), ...container.querySelectorAll("td, span, h1, h2, p, div")]
  .find((el) => el.textContent.trim() === text);

test("dashboard: Customer Support by default, team switch, filters and views", async () => {
  await act(async () => root.render(<Dashboard />));
  await flush();
  // Overview is the default view; switch to the screenings list
  click(byText("Screenings"));
  const table = () => [...container.querySelectorAll("table")].pop().textContent;
  expect(table()).toContain("Ed Green");
  expect(table()).not.toContain("Lisa Gilmore");
  click(byText("Internal Support"));
  expect(table()).toContain("Lisa Gilmore");
  expect(table()).not.toContain("Ed Green");
  click(byText("All Teams"));
  expect(table()).toContain("Ed Green");
  expect(table()).toContain("Internal Support"); // team column shown on All
  // Result filter
  const result = container.querySelector('select[aria-label="Result"]');
  await act(async () => {
    result.value = "Fail";
    result.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(table()).toContain("Lisa Gilmore");
  expect(table()).not.toContain("Ed Green");
  // Agents view lists the remaining agent with the most-missed column
  click(byText("Agents"));
  expect(container.textContent).toContain("Most missed");
});

test("detail panel shows history and offers Edit only when allowed", async () => {
  api.getScreening.mockResolvedValue({
    ...screening({ suggestions: "Great empathy" }),
    edits: [{ id: 9, edited_by: "lead@example.com", edited_at: "2026-11-12T10:00:00+00:00",
              changes: { score_percent: { from: 80, to: 100 }, "answers.Greeting": { from: "No", to: "Yes" } } }],
    attachments: [{ id: 3, filename: "call.mp3", content_type: "audio/mpeg", size_bytes: 2048 }],
  });
  const onEdit = jest.fn();
  await act(async () => root.render(<ScreeningDetail screeningId={1} onClose={() => {}} onEdit={onEdit} />));
  await flush();
  const text = container.textContent;
  expect(text).toContain("Score: 80% → 100%");
  expect(text).toContain("Greeting: No → Yes");
  expect(text).toContain("call.mp3");
  expect(text).toContain("Great empathy");
  click(byText("Edit"));
  expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));

  api.getScreening.mockResolvedValue({ ...screening({ can_edit: false }), edits: [], attachments: [] });
  await act(async () => root.render(<ScreeningDetail screeningId={2} onClose={() => {}} onEdit={onEdit} />));
  await flush();
  expect(byText("Edit")).toBeUndefined();
  expect(container.textContent).toContain("Not edited since it was submitted.");
});

test("edit mode pre-fills the form and saves through updateScreening", async () => {
  api.updateScreening.mockResolvedValue({ ...screening(), changed: false });
  const onDone = jest.fn();
  await act(async () => root.render(
    <QAForm editScreening={{ ...screening({ suggestions: "Keep it up" }), attachments: [] }} onDone={onDone} />
  ));
  await flush();
  expect(byText("Edit Screening")).toBeTruthy();
  expect(container.querySelector("textarea").value).toBe("Keep it up");
  const save = byText("Save Changes");
  expect(save.disabled).toBe(false); // every answer already filled in
  await act(async () => { save.closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await flush();
  expect(api.updateScreening).toHaveBeenCalledWith(1, expect.objectContaining({
    agentName: "Ed Green", channel: "Phone", contactId: "C1", answers: allYes, suggestions: "Keep it up",
  }));
  expect(api.createScreening).not.toHaveBeenCalled();
  expect(container.textContent).toContain("No changes were made");
});

test("manager review renders with data (it crashed on a missing date helper)", async () => {
  await act(async () => root.render(<ManagerReview />));
  await flush();
  expect(container.textContent).toContain("Ed Green");
  expect(container.textContent).toContain("Lisa Gilmore");
});

test("new screening: Y / N / A keys answer and advance; Submit explains what's missing", async () => {
  window.localStorage.clear();
  await act(async () => root.render(<QAForm onDone={() => {}} />));
  await flush();
  const press = (key) => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
  expect(container.textContent).toContain("Choose the agent to submit.");
  press("y");
  press("n");
  press("a");
  const groups = container.querySelectorAll('[role="radiogroup"]');
  const checked = (i) => groups[i].querySelector('[aria-checked="true"]')?.textContent;
  expect([checked(0), checked(1), checked(2), checked(3)]).toEqual(["Yes", "No", "N/A", undefined]);
  expect(container.textContent).toContain("3/20 answered");
  // Draft is kept in this browser
  await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
  const draftKey = Object.keys(window.localStorage).find((k) => k.startsWith("qa-draft:"));
  expect(JSON.parse(window.localStorage.getItem(draftKey)).answers.Greeting).toBe("Yes");
});

test("removed people are hidden on the dashboard unless included", async () => {
  api.listScreenings.mockResolvedValue({
    screenings: [
      screening({ id: 1, agent_name: "Ed Green" }),
      screening({ id: 5, agent_name: "Levi Gone", agent_active: false }),
    ],
  });
  await act(async () => root.render(<Dashboard />));
  await flush();
  click(byText("Screenings"));
  const table = () => [...container.querySelectorAll("table")].pop().textContent;
  expect(table()).toContain("Ed Green");
  expect(table()).not.toContain("Levi Gone");
  const box = [...container.querySelectorAll('input[type="checkbox"]')]
    .find((el) => el.parentElement.textContent.includes("Include removed people"));
  click(box);
  expect(table()).toContain("Levi Gone");
});

test("settings: Remove asks first, saves active=false, and offers Restore", async () => {
  api.listAgents.mockResolvedValue({ agents: [
    { id: 7, name: "Levi Gone", email: "", team: "customer_support", active: true },
    { id: 8, name: "Ed Green", email: "", team: "customer_support", active: true },
  ] });
  api.listEvaluatorPairs.mockResolvedValue({ pairs: [] });
  api.updateAgent.mockResolvedValue({ id: 7, name: "Levi Gone", team: "customer_support", active: false });
  window.confirm = jest.fn(() => true);
  await act(async () => root.render(<Settings />));
  await flush();
  const row = [...container.querySelectorAll("tr")].find((tr) => tr.textContent.includes("Levi Gone"));
  await act(async () => { row.querySelector("button").click(); });
  await flush();
  expect(window.confirm).toHaveBeenCalled();
  expect(api.updateAgent).toHaveBeenCalledWith(7, { active: false });
  expect([...container.querySelectorAll("tr")].some((tr) => tr.textContent.includes("Levi Gone"))).toBe(false);
  click(byText("\u25B8 Removed people (1)"));
  expect(byText("Restore")).toBeTruthy();
});
