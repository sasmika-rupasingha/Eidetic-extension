export interface ChatImage {
  mime: string;
  /** Base64 without the data: prefix. */
  base64: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  image?: ChatImage;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  /** Ask for JSON only (used for quiz and find-by-meaning). */
  json?: boolean;
  maxTokens?: number;
}

export interface StreamOptions {
  signal?: AbortSignal;
  /** Called with the full text so far each time more arrives. */
  onText?: (full: string) => void;
}

export type AiErrorCode = 'unavailable' | 'auth' | 'quota' | 'model' | 'network' | 'permission' | 'cancelled' | 'setup' | 'server';

export class AiError extends Error {
  constructor(
    message: string,
    public code: AiErrorCode,
    public hint = '',
  ) {
    super(message);
  }
}

export interface HttpRequest {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
}
