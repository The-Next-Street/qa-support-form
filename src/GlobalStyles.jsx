import React from "react";
import { COLORS } from "./brand";

// Page-wide CSS that inline styles can't express: phone layouts (media
// queries), keyboard focus rings, and hover states. Rendered once in App.
// Phone overrides use !important because most layout is set inline.
const css = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; overflow-x: hidden; background: ${COLORS.offWhite}; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 3px solid ${COLORS.sky}; outline-offset: 2px;
}

/* Top navigation: tabs scroll sideways on narrow screens instead of overflowing */
.qa-nav { position: sticky; top: 0; z-index: 30; }
.qa-nav-tabs { display: flex; align-items: center; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.qa-nav-tabs::-webkit-scrollbar { display: none; }
.qa-nav-tabs button { white-space: nowrap; flex-shrink: 0; }

/* Screening form */
.qa-question { display: flex; align-items: center; gap: 12px; cursor: pointer; scroll-margin: 90px 0 120px; }
.qa-question-text { flex: 1; min-width: 0; }
.qa-answer-group { display: inline-flex; flex-shrink: 0; border-radius: 10px; overflow: hidden; border: 1.5px solid ${COLORS.lightGray}; }
.qa-answer-group button { min-width: 64px; min-height: 40px; border: none; border-left: 1.5px solid ${COLORS.lightGray}; cursor: pointer; font-weight: 700; font-size: 14px; }
.qa-answer-group button:first-child { border-left: none; }
.qa-answer-group button:hover { filter: brightness(0.97); }
.qa-dropzone { transition: border-color .15s, background .15s; }
.qa-dropzone.is-over { border-color: ${COLORS.orange} !important; background: #FEF3E2 !important; }
.qa-kbd { display: inline-block; min-width: 18px; padding: 0 5px; border: 1px solid ${COLORS.lightGray}; border-bottom-width: 2px;
  border-radius: 4px; font: 600 11px/16px ui-monospace, monospace; color: ${COLORS.gray}; background: ${COLORS.white}; text-align: center; }
.qa-sticky-bar { position: sticky; bottom: 0; z-index: 20; }

/* Compact, consistent page chrome: slim white page headers instead of
   big orange banners, smaller type, denser tables. */
.qa-page { font-size: 13px; }
.qa-card-header { background: ${COLORS.white} !important; color: ${COLORS.charcoal} !important;
  padding: 14px 20px !important; border-bottom: 1px solid ${COLORS.lightGray}; box-shadow: inset 4px 0 0 ${COLORS.orange}; }
.qa-card-header h1 { font-size: 18px !important; color: ${COLORS.charcoal} !important; }
.qa-card-header p { font-size: 12.5px !important; color: ${COLORS.midGray} !important; margin-top: 2px !important; }
.qa-card-body { padding: 18px 20px !important; }
.qa-page table th { font-size: 11px !important; padding: 7px 10px !important; }
.qa-page table td { font-size: 12.5px !important; padding: 7px 10px !important; }

/* Tables scroll inside their card, never the whole page */
.qa-scroll-x { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.qa-clickable-row:hover td { background: #FFF7ED; }

@media (max-width: 720px) {
  .qa-page { padding: 12px 8px !important; }
  .qa-card-body { padding: 16px !important; }
  .qa-card-header { padding: 18px 16px !important; }
  .qa-stack { flex-direction: column !important; }
  .qa-nav-user { display: none !important; }
  .qa-question { flex-wrap: wrap; align-items: flex-start; }
  .qa-answer-group { display: flex; width: 100%; }
  .qa-answer-group button { flex: 1; min-height: 44px; }
  .qa-hide-mobile { display: none !important; }
  .qa-show-mobile { display: inline !important; }
  .qa-sticky-bar { margin: 20px -16px -16px !important; padding: 10px 12px !important; }
}
`;

export default function GlobalStyles() {
  return <style>{css}</style>;
}
