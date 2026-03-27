# Support Quality Assurance — React Form App

A React web app for completing QA screenings. Users sign in with their Microsoft work
account, fill out the 20-question form, and the submission is saved directly to the
`QA_SupportPhones` SharePoint list with auto-calculated scores.

## Features
- Microsoft SSO sign-in (no separate passwords)
- 20 Yes/No QA criteria grouped by category
- Live score calculation as you answer (TotalScore, ScorePercent, PassFail)
- Saves directly to SharePoint — no manual data entry
- Works on any modern browser, mobile-friendly

## Setup

See **AZURE_SETUP.md** for the one-time Azure app registration steps.

## Project Structure

```
src/
  authConfig.js        ← Put your Client ID and Tenant ID here
  sharepointService.js ← SharePoint API call logic
  questions.js         ← Question text (easy to edit)
  App.jsx              ← Sign-in wrapper
  components/
    QAForm.jsx         ← The main form UI
```

## Quick Start

```bash
npm install
npm start
```
