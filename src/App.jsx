import React from "react";
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate, useMsal } from "@azure/msal-react";
import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig, loginRequest } from "./authConfig";
import QAForm from "./components/QAForm";

const msalInstance = new PublicClientApplication(msalConfig);

function SignInPage() {
  const { instance } = useMsal();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #e8f0fe 0%, #f0f4f8 100%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          padding: "48px 40px",
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "#E8F0FE",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: 28,
          }}
        >
          🔒
        </div>
        <h2 style={{ margin: "0 0 8px", color: "#1F5C99", fontSize: 22 }}>
          Support Quality Assurance
        </h2>
        <p style={{ color: "#666", margin: "0 0 28px", fontSize: 14 }}>
          Sign in with your Microsoft work account to access the QA screening form.
        </p>
        <button
          onClick={() => instance.loginPopup(loginRequest)}
          style={{
            width: "100%",
            padding: "12px",
            background: "#1F5C99",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>🏢</span> Sign in with Microsoft
        </button>
        <p style={{ color: "#aaa", fontSize: 12, margin: "16px 0 0" }}>
          The Next Street · Customer Service Department
        </p>
      </div>
    </div>
  );
}

function AppContent() {
  const { accounts, instance } = useMsal();

  return (
    <>
      <AuthenticatedTemplate>
        {/* Thin top bar with user info + sign out */}
        <div
          style={{
            background: "#154073",
            color: "#A9C4DE",
            fontSize: 12,
            padding: "6px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            Signed in as <strong style={{ color: "#fff" }}>{accounts[0]?.name || accounts[0]?.username}</strong>
          </span>
          <button
            onClick={() => instance.logoutPopup()}
            style={{
              background: "none",
              border: "1px solid #4a7ab5",
              color: "#A9C4DE",
              padding: "3px 10px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Sign out
          </button>
        </div>
        <QAForm />
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
