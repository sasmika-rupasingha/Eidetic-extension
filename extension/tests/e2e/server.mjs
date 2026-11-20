// Test site + mock AI servers for the end-to-end run. No dependencies.
//  - Pages to capture: a Python error, a table, an event poster, private details, a video, and a PDF.
//  - A mock Ollama (native /api/tags, /api/show and the OpenAI-compatible /v1/chat/completions with streaming).
//  - A mock "cloud" Gemini (/models and :streamGenerateContent), to check routing and that Private mode never calls it.
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;font:18px/1.5 'DejaVu Sans',Arial,sans-serif;color:#111;background:#fff}#target{position:absolute;left:40px;top:40px;padding:24px 28px;background:#fff}
.big{font-size:30px;line-height:1.5;font-weight:600}table{border-collapse:collapse;font-size:28px}td{padding:8px 60px 8px 0}pre{font:24px/1.5 'DejaVu Sans Mono',monospace;margin:0}</style></head><body>${body}</body></html>`;

/** A minimal one-page PDF with large Helvetica text (hand-built, so the test needs no PDF library). */
export function makePdf(lines) {
  const text = lines.map((l, i) => `BT /F1 34 Tf 60 ${760 - i * 60} Td (${l.replace(/[()\\]/g, '')}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export function startServers(port, videoPath) {
  const requests = [];
  const pages = {
    '/error': page('Training script', `<pre id="target">Traceback (most recent call last):\n  File "train.py", line 3, in &lt;module&gt;\n    import pandas as pd\nModuleNotFoundError: No module named 'pandas'</pre>`),
    '/table': page('Results', `<div id="target"><table><tr><td>Model</td><td>Accuracy</td><td>Recall</td></tr><tr><td>CNN</td><td>0.91</td><td>0.89</td></tr><tr><td>SVM</td><td>0.84</td><td>0.80</td></tr><tr><td>Forest</td><td>0.87</td><td>0.85</td></tr></table></div>`),
    '/event': page('Events', `<div id="target" class="big">AI Research Symposium 2026<br>Date: 12 December 2026<br>Time: 9.30 am<br>Venue: Main Auditorium</div>`),
    '/private': page('Config', `<pre id="target">Support: nimal.perera@example.com\nOPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwx1234</pre>`),
    '/video': page('Week 7 lecture', `<video id="target" src="/lecture.webm" width="640" height="360" muted playsinline style="left:40px;top:40px;position:absolute;padding:0"></video>`),
  };

  // Mock answers by task, so the run can check that the right prompt reached the right model.
  const reply = (body) => {
    const text = JSON.stringify(body.messages ?? body.contents ?? '');
    if (text.includes('Return JSON only'))
      return JSON.stringify(text.includes('Symposium') ? { description: 'Poster for the AI Research Symposium on 12 December', keywords: ['symposium'], topics: ['Events'] } : text.includes('pandas') ? { description: 'Python script fails because pandas is not installed', keywords: ['pandas', 'python'], topics: ['Python errors'] } : { description: 'Results table comparing three models', keywords: ['accuracy'], topics: ['Machine learning'] });
    if (text.includes('Say OK')) return 'OK';
    if (text.includes('Which version of pip')) return 'Use **pip 24** or newer.';
    if (text.includes('This is an error')) return '**Cause.** The pandas package is not installed for this Python.\n\n**Fix.** Install it:\n\n```\npython -m pip install pandas\n```';
    if (text.includes('Describe what this shows')) return 'A short lecture slide about information gain.';
    if (text.includes('Explain what this is')) return 'This is a **results table** comparing three models.';
    return 'Here is the answer: **it works**.';
  };

  const sse = (res, chunks) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    let i = 0;
    const tick = () => {
      if (i < chunks.length) {
        res.write(`data: ${chunks[i++]}\n\n`);
        setTimeout(tick, 5);
      } else res.end('data: [DONE]\n\n');
    };
    tick();
  };
  const readBody = (req) => new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    if (req.method === 'OPTIONS') return res.end();
    // ---- mock Ollama
    if (url.pathname === '/api/tags')
      return res.end(JSON.stringify({ models: [{ name: 'qwen2.5:7b', size: 4683087332, details: { parameter_size: '7.6B', families: ['qwen2'] } }, { name: 'llava:7b', size: 4733363377, details: { parameter_size: '7B', families: ['llama', 'clip'] } }] }));
    if (url.pathname === '/api/show') {
      const body = await readBody(req);
      return res.end(JSON.stringify({ capabilities: body.model?.startsWith('llava') ? ['completion', 'vision'] : ['completion', 'tools'], model_info: { 'general.context_length': body.model?.startsWith('llava') ? 4096 : 32768 } }));
    }
    if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
      const body = await readBody(req);
      requests.push({ via: 'ollama', model: body.model, body });
      const out = reply(body);
      return sse(res, (out.match(/[\s\S]{1,12}/g) ?? []).map((p) => JSON.stringify({ choices: [{ delta: { content: p } }] })));
    }
    // ---- mock Gemini ("cloud")
    if (url.pathname === '/gemini/models') return res.end(JSON.stringify({ models: [{ name: 'models/gemini-test', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1000000 }] }));
    if (url.pathname.startsWith('/gemini/models/') && req.method === 'POST') {
      const body = await readBody(req);
      requests.push({ via: 'gemini', model: url.pathname.split('/').pop(), body });
      const out = reply(body);
      return sse(res, (out.match(/[\s\S]{1,12}/g) ?? []).map((p) => JSON.stringify({ candidates: [{ content: { parts: [{ text: p }] } }] })));
    }
    // ---- test pages
    if (url.pathname === '/lecture.webm' && videoPath && existsSync(videoPath)) {
      // Range support, so the browser can seek inside the video.
      const data = readFileSync(videoPath);
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
      res.setHeader('content-type', 'video/webm');
      res.setHeader('accept-ranges', 'bytes');
      if (!m) return res.end(data);
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : data.length - 1;
      res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': end - start + 1 });
      return res.end(data.subarray(start, end + 1));
    }
    if (url.pathname === '/scan.pdf') {
      res.setHeader('content-type', 'application/pdf');
      return res.end(makePdf(['SCANNED NOTICE', 'Exam hall B12', 'Starts 9.00 am']));
    }
    if (pages[url.pathname]) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return res.end(pages[url.pathname]);
    }
    res.statusCode = 404;
    res.end('not found');
  };
  const server = createServer((req, res) => void handler(req, res)).listen(port, '127.0.0.1');
  return { requests, close: () => server.close() };
}
