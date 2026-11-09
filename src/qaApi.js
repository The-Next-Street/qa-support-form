// ─────────────────────────────────────────────────────────────────────────────
// QA service client (assignments, agent metrics, agent roster).
//
// The QA service checks the signed-in person's Microsoft sign-in, so no
// API key lives in this page. Anything placed in this page is public.
// ─────────────────────────────────────────────────────────────────────────────

import { msalInstance } from "./msalInstance";
import { loginRequest } from "./authConfig";

export const QA_SERVICE_URL = "https://support-qa-64ne.onrender.com";

async function getIdToken(forceRefresh = false) {
  const account = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
  if (!account) throw new Error("Not signed in. Sign in again and retry.");
  const result = await msalInstance.acquireTokenSilent({ ...loginRequest, account, forceRefresh });
  return result.idToken;
}

// fetch() against the QA service with the user's Microsoft sign-in attached.
// Retries once with a refreshed sign-in if the service says it expired.
export async function qaFetch(path, options = {}) {
  const send = async (forceRefresh) => {
    const token = await getIdToken(forceRefresh);
    return fetch(`${QA_SERVICE_URL}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
  };
  const res = await send(false);
  return res.status === 401 ? send(true) : res;
}
