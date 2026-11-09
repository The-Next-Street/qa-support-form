import { PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "./authConfig";

// One shared MSAL instance: used by <MsalProvider> in App.jsx and by
// qaApi.js to get the signed-in user's token for the QA service.
export const msalInstance = new PublicClientApplication(msalConfig);
