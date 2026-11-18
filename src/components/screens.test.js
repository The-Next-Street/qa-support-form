import React, { act } from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "./Dashboard";
import ScreeningDetail from "./ScreeningDetail";
import QAForm from "./QAForm";
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
const byText = (text) => [...container.querySelectorAll("button, td, span, h1, h2, p, div")]
  .find((el) => el.textContent.trim() === text);

test("dashboard opens on Customer Support and switches teams", async () => {
  await act(async () => root.render(<Dashboard />));
  await flush();
  const table = () => [...container.querySelectorAll("table")].pop().textContent;
  expect(table()).toContain("Ed Green");
  expect(table()).not.toContain("Lisa Gilmore");
  click(byText("Internal Support"));
  expect(table()).toContain("Lisa Gilmore");
  expect(table()).not.toContain("Ed Green");
  click(byText("All Teams"));
  expect(table()).toContain("Ed Green");
  expect(table()).toContain("Internal Support"); // team column shown on All
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
