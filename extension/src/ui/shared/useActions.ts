/** Running a capture's actions from the UI: local results (clipboard, links, downloads, speech) and streamed AI answers. */
import { useCallback, useRef, useState } from 'react';
import { runLocal, type LocalResult } from '../../actions/local';
import type { ActionDef } from '../../actions/registry';
import { AI_TASKS, type AiTaskId } from '../../ai/prompts';
import { route, isRoute, type Route } from '../../ai/router';
import { describeError, readyMap, runAi, type Statuses } from '../../ai/run';
import type { ChatMessage } from '../../ai/types';
import { CATEGORY_LABEL } from '../../detect/classify';
import { redactImage } from '../../privacy/redact';
import { base64Of, blobToDataUrl, mimeOf, shrinkForModel } from '../../shared/image';
import { getImage, updateCapture, type Capture } from '../../store/captures';
import { PROVIDER_INFO, type Settings } from '../../store/settings';

export interface Answer {
  task: AiTaskId;
  label: string;
  text: string;
  route: Route | null;
  streaming: boolean;
  error?: { message: string; hint: string };
  /** The conversation after the first request: the first answer, then follow-up questions and answers. */
  turns: ChatMessage[];
  pendingQuestion?: string;
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens a link the user chose: web pages in a new tab; mail and phone links through the system. */
export function openLink(url: string): void {
  if (/^https?:/i.test(url)) void chrome.tabs.create({ url });
  else if (/^(mailto|tel):/i.test(url)) window.open(url, '_blank', 'noopener');
}

const extOf = (mime: string) => (mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png');

/** A short line saying where an AI request will go, for the UI. */
export function routeLine(r: Route): string {
  if (r.local) return `Runs on ${r.provider === 'builtin' ? PROVIDER_INFO.builtin.name : `${PROVIDER_INFO[r.provider].name} · ${r.model}`}. Nothing leaves this computer.`;
  return `Sends the ${r.sendImage ? 'image and text' : 'text'} to ${PROVIDER_INFO[r.provider].name} · ${r.model}.`;
}

/** Where a task would go right now, without sending anything. */
export function previewRoute(task: AiTaskId, s: Settings, statuses: Statuses, hasImage: boolean): Route | null {
  const r = route(AI_TASKS[task].cls, s, readyMap(statuses), { hasImage });
  return isRoute(r) ? r : null;
}

export function useActions(capture: Capture | null | undefined, s: Settings | null, statuses: Statuses, toast: (m: string) => void) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const abort = useRef<AbortController | null>(null);

  const ctxText = capture?.ocr?.text ?? '';

  const handleLocal = useCallback(
    async (res: LocalResult) => {
      if (!capture) return;
      if (res.kind === 'copy') {
        await navigator.clipboard.writeText(res.text).then(
          () => toast(res.message),
          () => toast('Couldn’t copy. Click inside the panel first, then try again.'),
        );
      } else if (res.kind === 'open') {
        openLink(res.url);
        toast(res.message);
      } else if (res.kind === 'download') {
        download(res.blob, res.filename);
        toast(res.message);
      } else if (res.kind === 'speak') {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(res.text.slice(0, 4000));
        speechSynthesis.speak(u);
        toast(res.message);
      } else if (res.kind === 'image') {
        const blob = await getImage(capture.image.blobId);
        if (blob) download(blob, `eidetic-${String(capture.number).padStart(4, '0')}.${extOf(blob.type)}`);
        toast(res.message);
      }
    },
    [capture, toast],
  );

  /**
   * Runs an AI task. A conversation is kept as `turns` (everything after the first request: the first answer, then
   * each follow-up question and its answer). `text` is the answer currently streaming.
   */
  const runAiTask = useCallback(
    async (task: AiTaskId, label: string, question?: string, prev?: Answer) => {
      if (!capture || !s || !capture.detection) return;
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      const history = prev?.turns ?? [];
      setAnswer({ task, label, text: '', route: prev?.route ?? null, streaming: true, turns: history, ...(question ? { pendingQuestion: question } : {}) });
      let image;
      if (AI_TASKS[task].visual && !prev) {
        const blob = await getImage(capture.image.blobId);
        if (blob) {
          const url = await shrinkForModel(await blobToDataUrl(blob));
          image = { mime: mimeOf(url), base64: base64Of(url) };
        }
      }
      try {
        const run = await runAi(
          task,
          { text: ctxText, category: capture.detection.label || CATEGORY_LABEL[capture.detection.category], description: capture.ai.description ?? capture.detection.description, source: capture.source.site, image },
          s,
          statuses,
          {
            signal: ctl.signal,
            question,
            history: prev ? history : undefined,
            onRoute: (r) => setAnswer((a) => (a ? { ...a, route: r } : a)),
            onText: (t) => setAnswer((a) => (a ? { ...a, text: t } : a)),
          },
        );
        const turns: ChatMessage[] = question ? [...history, { role: 'user', text: question }, { role: 'assistant', text: run.text }] : [{ role: 'assistant', text: run.text }];
        setAnswer({ task, label, text: '', route: run.route, streaming: false, turns });
        await updateCapture(capture.id, (c) => {
          c.answers = [...c.answers, { task, label: question ? `${label} · ${question}` : label, text: run.text, model: run.route.model, local: run.route.local, at: Date.now() }].slice(-20);
          c.status = 'kept';
        });
      } catch (e) {
        const err = describeError(e);
        setAnswer((a) => (a ? { ...a, streaming: false, error: err } : a));
      }
    },
    [capture, s, statuses, ctxText],
  );

  const run = useCallback(
    async (a: ActionDef) => {
      if (!capture || !s || !capture.detection) return;
      if (a.kind === 'local' && a.local) {
        await handleLocal(runLocal(a.local, { text: ctxText, detection: capture.detection, findings: capture.privacy?.findings ?? [], settings: s, title: capture.source.title, number: capture.number }));
        return;
      }
      if (a.ai) await runAiTask(a.ai, a.label);
    },
    [capture, s, ctxText, handleLocal, runAiTask],
  );

  const followUp = useCallback(
    async (question: string) => {
      if (!question.trim()) return;
      if (answer && !answer.streaming && !answer.error && answer.turns.length) await runAiTask(answer.task, answer.label, question.trim(), answer);
      else await runAiTask('ask', 'Ask', question.trim());
    },
    [answer, runAiTask],
  );

  const stop = useCallback(() => abort.current?.abort(), []);

  const safeImage = useCallback(
    async (boxes: Parameters<typeof redactImage>[1]) => {
      if (!capture) return;
      const blob = await getImage(capture.image.blobId);
      if (!blob) return;
      download(await redactImage(blob, boxes, 'black'), `eidetic-${String(capture.number).padStart(4, '0')}-safe.png`);
      toast('Safe image downloaded. The original is unchanged.');
    },
    [capture, toast],
  );

  return { answer, setAnswer, run, followUp, stop, safeImage };
}
