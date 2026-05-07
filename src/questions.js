// ─────────────────────────────────────────────────────────────────────────────
// QA Screening Questions
// 20 questions stored as SharePoint Choice columns with values: Yes / No / N/A
// "N/A" is excluded from scoring (does not count toward total or earned).
// ─────────────────────────────────────────────────────────────────────────────

// Field name in React state → SharePoint column name (display + internal target)
// The submit code maps these case-insensitively to the actual SharePoint column.
export const QA_QUESTIONS = [
  { field: "Greeting", category: "Opening",
    label: "Greeting",
    description: 'Uses a friendly and professional greeting (e.g., "Thank you for calling [Company], this is [Agent]. How may I assist you today?")' },

  { field: "ActiveListening", category: "Listening",
    label: "Active Listening",
    description: "Demonstrates active listening (e.g., acknowledges caller, uses verbal cues). Avoids interrupting the caller." },

  { field: "Professionalism", category: "Tone",
    label: "Professionalism",
    description: "Maintains a professional and courteous tone. Uses clear language. Avoids unprofessional language." },

  { field: "Empathy", category: "Tone",
    label: "Empathy",
    description: 'Uses empathetic language to acknowledge concerns (e.g., "I understand your frustration" or "It sounds like you\'re having trouble with...").' },

  { field: "NeedsIdentification", category: "Discovery",
    label: "Needs Identification",
    description: "Effectively gathers information to understand the caller's needs. Asks clarifying questions." },

  { field: "CustomerFocus", category: "Discovery",
    label: "Customer Focus",
    description: "Prioritizes the customer's needs throughout the call. Uses solutions tailored to the customer's situation." },

  { field: "BuildingRapport", category: "Connection",
    label: "Building Rapport",
    description: "Establishes rapport and builds trust with the customer. Maintains a positive and helpful attitude." },

  { field: "Communication", category: "Connection",
    label: "Communication",
    description: "Communicates clearly and concisely. Avoids technical jargon and uses language the customer understands." },

  { field: "ProductKnowledge", category: "Knowledge",
    label: "Product Knowledge",
    description: "Demonstrates a strong understanding of the company's products and services. Answers questions accurately." },

  { field: "SolutionOriented", category: "Knowledge",
    label: "Solution Oriented",
    description: "Focuses on providing solutions to customer problems. Offers multiple options when possible." },

  { field: "ProblemSolvingSkills", category: "Resolution",
    label: "Problem Solving Skills",
    description: "Uses critical thinking and problem-solving skills to address customer concerns." },

  { field: "Escalation", category: "Resolution",
    label: "Escalation",
    description: "Knows when to escalate complex issues to a supervisor. Follows proper procedures for escalation." },

  { field: "FirstCallResolution", category: "Resolution",
    label: "First Call Resolution",
    description: "Attempts to resolve the customer's issue during the first call. Documents the resolution clearly." },

  { field: "ActionItemsFollowUp", category: "Resolution",
    label: "Action Items & Follow Up",
    description: "Clearly communicates any action items or follow-up steps. Documents next steps and deadlines." },

  { field: "Verification", category: "Closing",
    label: "Verification",
    description: "Verifies customer satisfaction with the resolution before ending the call. Offers options for further assistance." },

  { field: "CallClosure", category: "Closing",
    label: "Call Closure",
    description: "Ends the call with a courteous and professional closing. Thanks the customer for their call." },

  { field: "TNSPoliciesProcedures", category: "Compliance",
    label: "TNS Policies & Procedures",
    description: "Adheres to all company policies and procedures during the call." },

  { field: "Upselling", category: "Compliance",
    label: "Upselling",
    description: "Presents upselling opportunities in a professional and appropriate manner if applicable." },

  { field: "Compliance", category: "Compliance",
    label: "Compliance",
    description: "Maintains compliance with industry regulations and legal requirements." },

  { field: "CoachingDevelopment", category: "Growth",
    label: "Coaching & Development",
    description: "Open to coaching and feedback for continuous development. Willing to learn and improve." },
];

// Map our React field name → SharePoint column display name (used by submit code)
export const FIELD_TO_SP_COLUMN = {
  Greeting: "Greeting",
  ActiveListening: "Active Listening",
  Professionalism: "Professionalism",
  Empathy: "Empathy",
  NeedsIdentification: "Needs Identification",
  CustomerFocus: "Customer Focus",
  BuildingRapport: "Building Rapport",
  Communication: "Communication",
  ProductKnowledge: "Product Knowledge",
  SolutionOriented: "Solution Oriented",
  ProblemSolvingSkills: "Problem Solving Skills",
  Escalation: "Escalation",
  FirstCallResolution: "First Call Resolution",
  ActionItemsFollowUp: "Action Items & Follow Up",
  Verification: "Verification",
  CallClosure: "Call Closure",
  TNSPoliciesProcedures: "TNS Policies & Procedures",
  Upselling: "Upselling",
  Compliance: "Compliance",
  CoachingDevelopment: "Coaching & Development",
};

// Per-channel variant: same questions for all channels for now.
// (Channel-specific wording can be added later if needed.)
export const CHANNELS = ["Phone", "Chat", "Email", "SMS"];
export const QA_QUESTIONS_BY_CHANNEL = CHANNELS.reduce((acc, ch) => {
  acc[ch] = QA_QUESTIONS;
  return acc;
}, {});

// Score calculation: only Yes/No count toward the total. N/A is excluded.
// Returns: { earned, total, percent }
//   earned = number of Yes answers
//   total  = number of Yes+No answers (excluding N/A)
//   percent = round(earned / total * 100), or 0 when total is 0
export function calculateScore(answers, questions = QA_QUESTIONS) {
  let earned = 0;
  let total = 0;
  for (const q of questions) {
    const a = answers[q.field];
    if (a === "Yes") {
      earned += 1;
      total += 1;
    } else if (a === "No") {
      total += 1;
    }
    // "N/A" or null → excluded from scoring
  }
  const percent = total > 0 ? Math.round((earned / total) * 100) : 0;
  return { earned, total, percent };
}
