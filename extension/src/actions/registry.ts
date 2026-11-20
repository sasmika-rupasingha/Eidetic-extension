/**
 * Contextual actions: for each kind of capture, one primary action, two or three secondary ones and the rest under
 * More. Local actions always work; AI actions need a connected model. Without AI, the first local action becomes the
 * primary one and AI actions say "Connect AI" instead of failing.
 */
import type { AiTaskId } from '../ai/prompts';
import type { Category, Detection } from '../detect/classify';

export type LocalActionId =
  | 'copy-text' | 'copy-error' | 'copy-code' | 'copy-equation' | 'copy-tsv' | 'copy-markdown' | 'download-csv' | 'add-calendar'
  | 'copy-details' | 'open-link' | 'copy-link' | 'copy-vcard' | 'email' | 'call' | 'search-web' | 'download-image'
  | 'copy-items' | 'read-aloud' | 'safe-copy';

export interface ActionDef {
  id: string;
  label: string;
  kind: 'local' | 'ai';
  local?: LocalActionId;
  ai?: AiTaskId;
}

const L = (local: LocalActionId, label: string): ActionDef => ({ id: local, label, kind: 'local', local });
const A = (ai: AiTaskId, label: string): ActionDef => ({ id: `ai:${ai}`, label, kind: 'ai', ai });

interface Plan {
  primary: ActionDef;
  secondary: ActionDef[];
  more: ActionDef[];
}

const PLANS: Record<Category, Plan> = {
  error: { primary: A('fix', 'Explain & fix'), secondary: [L('copy-error', 'Copy error'), L('search-web', 'Search web')], more: [A('corrected-code', 'Corrected code'), A('explain', 'Explain in detail'), L('copy-text', 'Copy all text')] },
  code: { primary: L('copy-code', 'Copy code'), secondary: [A('explain-code', 'Explain'), A('find-bugs', 'Find bugs')], more: [A('convert-code', 'Convert to Python'), A('corrected-code', 'Tidy and fix'), L('download-image', 'Download image')] },
  math: { primary: L('copy-equation', 'Copy equation'), secondary: [A('solve', 'Solve'), A('explain-vars', 'Explain variables')], more: [A('related', 'Related concepts'), L('copy-text', 'Copy all text')] },
  table: { primary: L('copy-tsv', 'Copy for Excel'), secondary: [L('download-csv', 'Download CSV'), L('copy-markdown', 'Copy Markdown')], more: [A('summarize', 'Summarise'), A('analyze', 'Analyse'), L('copy-text', 'Copy as text')] },
  qr: { primary: L('open-link', 'Open link'), secondary: [L('copy-link', 'Copy')], more: [L('search-web', 'Search web')] },
  event: { primary: L('add-calendar', 'Add to calendar'), secondary: [L('copy-details', 'Copy details'), L('open-link', 'Open link')], more: [A('translate', 'Translate'), L('copy-text', 'Copy all text')] },
  contact: { primary: L('copy-vcard', 'Save contact'), secondary: [L('email', 'Email'), L('call', 'Call')], more: [L('copy-text', 'Copy text')] },
  receipt: { primary: L('copy-items', 'Copy items'), secondary: [L('download-csv', 'Download CSV')], more: [A('summarize', 'Summarise'), L('copy-text', 'Copy text')] },
  job: { primary: A('skills', 'Extract requirements'), secondary: [A('checklist', 'Preparation checklist'), L('copy-text', 'Copy text')], more: [A('missing-info', 'What is missing'), A('summarize', 'Summarise')] },
  product: { primary: A('summarize', 'Extract specs'), secondary: [A('missing-info', 'What is missing'), L('copy-text', 'Copy text')], more: [L('search-web', 'Search web')] },
  research: { primary: A('summarize', 'Summarise'), secondary: [A('findings', 'Key findings'), A('method', 'Method')], more: [A('limitations', 'Limitations'), A('notes', 'Make notes'), L('copy-text', 'Copy text')] },
  question: { primary: A('solve', 'Solve step by step'), secondary: [L('copy-text', 'Copy'), A('hint', 'Hint')], more: [A('similar', 'Similar question'), A('explain', 'Explain the topic')] },
  slide: { primary: A('explain-simple', 'Explain simply'), secondary: [L('copy-text', 'Copy text'), A('notes', 'Make notes')], more: [A('flashcards', 'Flashcards'), A('quiz', 'Quiz me'), A('translate', 'Translate')] },
  text: { primary: L('copy-text', 'Copy text'), secondary: [A('explain', 'Explain'), A('translate', 'Translate')], more: [A('summarize', 'Summarise'), L('read-aloud', 'Read aloud'), L('search-web', 'Search web')] },
  image: { primary: A('describe', 'Describe'), secondary: [L('download-image', 'Download image')], more: [A('extract-numbers', 'Extract numbers'), A('a11y', 'Accessibility notes')] },
};

export interface ActionSet extends Plan {
  /** True when the plan's AI primary was swapped for a local action because no AI is connected. */
  demoted: boolean;
}

/** Actions for a detection, adjusted to what this capture actually has and whether AI is available. */
export function actionsFor(d: Detection, aiReady: boolean, opts: { hasPrivacyFindings?: boolean; hasLinks?: boolean } = {}): ActionSet {
  const plan = PLANS[d.category];
  const hasLink = d.entities.some((e) => e.type === 'url') || Boolean(d.qr);
  const hasEmail = d.entities.some((e) => e.type === 'email');
  const hasPhone = d.entities.some((e) => e.type === 'phone');
  const keep = (a: ActionDef) => {
    if (a.local === 'open-link' || a.local === 'copy-link') return hasLink;
    if (a.local === 'email') return hasEmail;
    if (a.local === 'call') return hasPhone;
    if (a.local === 'add-calendar') return Boolean(d.event?.date || d.entities.some((e) => e.type === 'date'));
    return true;
  };
  let primary = plan.primary;
  let secondary = plan.secondary.filter(keep);
  let more = plan.more.filter(keep);
  if (!keep(primary)) {
    const next = [...secondary, ...more].find((a) => a.kind === 'local') ?? L('copy-text', 'Copy text');
    secondary = secondary.filter((a) => a.id !== next.id);
    more = more.filter((a) => a.id !== next.id);
    primary = next;
  }
  // Found links anywhere become a quick action.
  if (hasLink && primary.local !== 'open-link' && ![...secondary, ...more].some((a) => a.local === 'open-link')) more = [L('open-link', 'Open link'), ...more];
  if (opts.hasPrivacyFindings) more = [...more, L('safe-copy', 'Copy without private details')];
  if (!more.some((a) => a.local === 'download-image') && primary.local !== 'download-image' && !secondary.some((a) => a.local === 'download-image')) more = [...more, L('download-image', 'Download image')];
  more = [...more, A('ask', 'Ask a question')].filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);

  let demoted = false;
  if (!aiReady && primary.kind === 'ai') {
    const local = [...secondary, ...more].find((a) => a.kind === 'local');
    if (local) {
      secondary = [primary, ...secondary.filter((a) => a.id !== local.id)];
      more = more.filter((a) => a.id !== local.id);
      primary = local;
      demoted = true;
    }
  }
  return { primary, secondary: secondary.slice(0, 3), more: [...secondary.slice(3), ...more], demoted };
}
