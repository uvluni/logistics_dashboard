// How much AI the dashboard may use. ROADNET_AI_MODE (server setting) is the most allowed; each user
// may choose that or less in the chat panel.
//   full - Claude reads the tool results and answers with analysis (data is sent to the Claude API).
//   low  - Claude only reads the question and picks a view; it never receives ROADNET data.
//   off  - no AI at all: views are opened from a menu; nothing is sent to the Claude API.
export type AiMode = 'full' | 'low' | 'off';
const RANK: Record<AiMode, number> = { off: 0, low: 1, full: 2 };

export const isAiMode = (v: unknown): v is AiMode => v === 'full' || v === 'low' || v === 'off';

/** The most AI this installation allows (default full). An unknown value counts as off: fail closed. */
export function maxAiMode(): AiMode {
  const v = (process.env.ROADNET_AI_MODE || 'full').trim().toLowerCase();
  return isAiMode(v) ? v : 'off';
}

/** The mode a request runs in: what the user asked for, never more than the installation allows. */
export function effectiveMode(requested: unknown): AiMode {
  const max = maxAiMode();
  if (!isAiMode(requested)) return max;
  return RANK[requested] <= RANK[max] ? requested : max;
}
