// ─────────────────────────────────────────────────────────────────────────────
// The Next Street — Brand constants
// Source: Visual Brand Guide
// ─────────────────────────────────────────────────────────────────────────────

export const COLORS = {
  // Primary palette
  orange:     "#F58A21",
  green:      "#73BF45",
  sky:        "#29A3BD",
  gray:       "#3B3B3B",

  // Secondary palette
  clementine: "#FAB51C",
  lime:       "#CFDB26",
  aqua:       "#29D9CF",
  charcoal:   "#262626",

  // UI helpers
  white:      "#FFFFFF",
  offWhite:   "#F9F9F9",
  lightGray:  "#E8E8E8",
  midGray:    "#888888",

  // Semantic (using brand colors)
  pass:       "#73BF45",
  passBg:     "#EEF8E5",
  fail:       "#C62828",
  failBg:     "#FFEBEE",
  warning:    "#FAB51C",
  warningBg:  "#FFF8E1",
};

// Google Fonts fallback — Prometo and Ingra are proprietary.
// Use Poppins (geometric sans like Prometo) + Inter (clean sans like Ingra).
export const FONTS = {
  heading: "'Poppins', 'Segoe UI', Arial, sans-serif",
  body:    "'Inter', 'Segoe UI', Arial, sans-serif",
};

// Gradient used for header / hero areas
export const GRADIENT = {
  orange: `linear-gradient(135deg, ${COLORS.orange} 0%, #E07010 100%)`,
  dark:   `linear-gradient(135deg, ${COLORS.charcoal} 0%, ${COLORS.gray} 100%)`,
};
