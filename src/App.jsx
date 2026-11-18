import React, { useEffect, useState } from "react";
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from "@azure/msal-react";
import { loginRequest } from "./authConfig";
import { msalInstance } from "./msalInstance";
import { COLORS, FONTS, GRADIENT } from "./brand";
import QAForm from "./components/QAForm";
import Dashboard from "./components/Dashboard";
import Screenings from "./components/Screenings";
import { defaultFilters } from "./components/ui";
import Assignments from "./components/Assignments";
import ManagerReview from "./components/ManagerReview";
import Settings from "./components/Settings";
import { getMe } from "./qaApi";


// ── Sign-In Page ────────────────────────────────────────────────────────────

function SignInPage() {
  const { instance } = useMsal();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLORS.offWhite,
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          background: COLORS.white,
          borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          padding: "48px 40px",
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        {/* TNS logo-colored circle */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "#FEF3E2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L4 7v10l8 5 8-5V7l-8-5z" fill={COLORS.orange} />
            <path d="M12 2v20M4 7l16 10M20 7L4 17" stroke={COLORS.white} strokeWidth="1.5" />
          </svg>
        </div>
        <h2 style={{ margin: "0 0 4px", color: COLORS.orange, fontSize: 22, fontFamily: FONTS.heading }}>
          The Next Street
        </h2>
        <p style={{ margin: "0 0 4px", color: COLORS.gray, fontSize: 16, fontWeight: 600, fontFamily: FONTS.heading }}>
          Quality Assurance
        </p>
        <p style={{ color: COLORS.midGray, margin: "0 0 28px", fontSize: 14 }}>
          Sign in with your Microsoft work account to continue.
        </p>
        <button
          onClick={() => instance.loginPopup(loginRequest)}
          style={{
            width: "100%",
            padding: "12px",
            background: GRADIENT.orange,
            color: COLORS.white,
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            fontFamily: FONTS.heading,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          Sign in with Microsoft
        </button>
        <p style={{ color: COLORS.lightGray, fontSize: 12, margin: "16px 0 0" }}>
          The Next Street {"\u00B7"} Customer Service Department
        </p>
      </div>
    </div>
  );
}

// ── Navigation Bar ──────────────────────────────────────────────────────────

const NAV_TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "screenings", label: "Screenings" },
  { key: "assignments", label: "Assignments" },
  { key: "review", label: "Manager Review" },
];

function NavBar({ page, setPage, isManager }) {
  const { accounts, instance } = useMsal();
  const tabs = [...NAV_TABS, ...(isManager ? [{ key: "settings", label: "Settings" }] : [])];

  return (
    <nav
      style={{
        background: COLORS.charcoal,
        color: "rgba(255,255,255,0.7)",
        fontSize: 13,
        padding: "0 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        fontFamily: FONTS.body,
      }}
    >
      {/* Left: brand + sections */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: FONTS.heading,
            fontWeight: 700,
            color: COLORS.orange,
            fontSize: 14,
            marginRight: 20,
            padding: "12px 0",
          }}
        >
          TNS Quality Assurance
        </span>
        {tabs.map((tab) => {
          const on = page === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setPage(tab.key)}
              aria-current={on ? "page" : undefined}
              style={{
                background: "none",
                border: "none",
                borderBottom: on ? `2px solid ${COLORS.orange}` : "2px solid transparent",
                color: on ? COLORS.white : "rgba(255,255,255,0.6)",
                padding: "12px 14px 10px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: FONTS.heading,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Right: main action + user */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
        <button
          onClick={() => setPage("form")}
          style={{
            background: page === "form" ? COLORS.white : COLORS.orange,
            color: page === "form" ? COLORS.orange : COLORS.white,
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: FONTS.heading,
            cursor: "pointer",
          }}
        >
          + New screening
        </button>
        <span style={{ fontSize: 12 }}>
          {accounts[0]?.name || accounts[0]?.username}
        </span>
        <button
          onClick={() => instance.logoutPopup()}
          style={{
            background: "none",
            border: `1px solid rgba(255,255,255,0.2)`,
            color: "rgba(255,255,255,0.6)",
            padding: "3px 10px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
            fontFamily: FONTS.body,
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

// ── App Content ─────────────────────────────────────────────────────────────

function AppContent() {
  const [page, setPage] = useState("dashboard");
  // where to go back to after an edit
  const [returnPage, setReturnPage] = useState("dashboard");
  // prefill holds data passed from Assignments → QAForm (and the assignment id to mark completed)
  const [prefill, setPrefill] = useState(null);
  // bumped after a screening submit so Assignments / Dashboard re-fetch
  const [refreshKey, setRefreshKey] = useState(0);
  // the screening being edited (from a detail panel)
  const [editScreening, setEditScreening] = useState(null);
  const [isManager, setIsManager] = useState(false);
  // team + date range, shared by Dashboard and Screenings
  const [filters, setFilters] = useState(defaultFilters);
  // filters handed to the Screenings page from the Dashboard (e.g. one agent, fails only)
  const [listFilters, setListFilters] = useState(null);
  const { accounts } = useMsal();

  // Ask the QA service whether the signed-in person is a manager (it decides;
  // this only controls whether the Settings tab is shown).
  useEffect(() => {
    if (!accounts[0]) return;
    getMe().then((me) => setIsManager(!!me.isManager)).catch(() => setIsManager(false));
  }, [accounts]);

  function openEdit(screening) {
    setPrefill(null);
    setReturnPage(page);
    setEditScreening(screening);
    setPage("form");
  }

  function openScreeningFromAssignment(data) {
    setPrefill(data);
    setPage("form");
  }

  function openScreenings(list) {
    setListFilters({ ...list });
    setPage("screenings");
  }

  function handleTabChange(newPage) {
    // Opening "New screening" from the nav always starts a fresh screening
    if (newPage === "form") {
      setPrefill(null);
      setEditScreening(null);
    }
    if (newPage === "screenings") setListFilters({});
    setPage(newPage);
  }

  function handleScreeningSubmitted() {
    const wasEdit = !!editScreening;
    setPrefill(null);
    setEditScreening(null);
    setRefreshKey((k) => k + 1);
    setPage(wasEdit ? returnPage : "assignments");
  }

  // Start each screen at the top
  useEffect(() => { window.scrollTo?.(0, 0); }, [page]);

  const shared = { refreshKey, onEdit: openEdit, filters, onFiltersChange: setFilters };

  return (
    <>
      <AuthenticatedTemplate>
        <NavBar page={page} setPage={handleTabChange} isManager={isManager} />
        {page === "dashboard" ? (
          <Dashboard {...shared} onOpenScreenings={openScreenings} />
        ) : page === "screenings" ? (
          <Screenings {...shared} initialListFilters={listFilters} onNew={() => handleTabChange("form")} />
        ) : page === "assignments" ? (
          <Assignments onScreen={openScreeningFromAssignment} refreshKey={refreshKey} />
        ) : page === "review" ? (
          <ManagerReview refreshKey={refreshKey} />
        ) : page === "settings" && isManager ? (
          <Settings />
        ) : (
          <QAForm
            key={editScreening ? `edit-${editScreening.id}` : "new"}
            prefill={prefill}
            editScreening={editScreening}
            onDone={handleScreeningSubmitted}
          />
        )}
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <SignInPage />
      </UnauthenticatedTemplate>
    </>
  );
}

export default function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <AppContent />
    </MsalProvider>
  );
}
