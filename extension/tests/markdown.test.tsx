// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown, parseBlocks, tableToTsv, texToMathElement } from '../src/ui/shared/markdown';

describe('Markdown', () => {
  it('renders structure', () => {
    const { container } = render(<Markdown text={'## Title\n\n- **one**\n- `two`\n\n1. first\n\n```js\nlet x = 1;\n```\n\n> quote'} />);
    expect(container.querySelector('h3')?.textContent).toBe('Title');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelector('strong')?.textContent).toBe('one');
    expect(container.querySelector('ol li')?.textContent).toBe('first');
    expect(container.querySelector('pre code')?.textContent).toBe('let x = 1;');
    expect(container.querySelector('blockquote')?.textContent).toBe('quote');
  });

  it('never turns model output into HTML', () => {
    const { container } = render(<Markdown text={'<img src=x onerror=alert(1)> [bad](javascript:alert(1)) [ok](https://example.com)'} />);
    expect(container.querySelector('img')).toBeNull();
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('https://example.com');
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('copes with an unfinished code block while streaming', () => {
    expect(parseBlocks('```\npartial').at(-1)).toEqual({ kind: 'code', lines: ['partial'], lang: '' });
  });
});

describe('Markdown: tables, code and maths', () => {
  it('renders pipe tables with alignment and a Copy that gives tab-separated cells', () => {
    const md = 'Costs:\n\n| Item | Price |\n|:--|--:|\n| Tea | **2** |\n| Cake | 3 |\n\nDone';
    const blocks = parseBlocks(md);
    const t = blocks.find((b) => b.kind === 'table');
    expect(t && t.kind === 'table' && t.head).toEqual(['Item', 'Price']);
    expect(t && t.kind === 'table' && t.align).toEqual(['left', 'right']);
    const { container } = render(<Markdown text={md} />);
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(2);
    expect(container.querySelector('td strong')?.textContent).toBe('2');
    expect(container.querySelector('[aria-label="Copy table"]')).not.toBeNull();
    expect(tableToTsv(['Item', 'Price'], [['Tea', '**2**']])).toBe('Item\tPrice\nTea\t2');
  });

  it('gives each code block a language label and its own copy button', () => {
    const { container } = render(<Markdown text={'```python\nprint(1)\n```\n\n```\nx\n```'} />);
    expect(Array.from(container.querySelectorAll('.code-head span')).map((s) => s.textContent)).toEqual(['python', 'code']);
    expect(container.querySelectorAll('[aria-label="Copy code"]')).toHaveLength(2);
  });

  it('renders inline and display maths as MathML', () => {
    const { container } = render(<Markdown text={'Area is $\\pi r^2$ here.\n\n$$\n\\frac{a}{b}\n$$\n\nAlso \\(x_1\\).'} />);
    const maths = container.querySelectorAll('math');
    expect(maths.length).toBe(3);
    expect(container.querySelector('.math-block mfrac')).not.toBeNull();
    expect(container.querySelector('[aria-label="Copy LaTeX"]')).not.toBeNull();
  });

  it('accepts $$…$$ inside a sentence', () => {
    const { container } = render(<Markdown text={'The total is $$\\sum_{i=1}^{n} p_i$$ so each $p_i$ is a number.'} />);
    expect(container.querySelectorAll('math')).toHaveLength(2);
    expect(container.textContent).not.toContain('$');
  });

  it('does not treat prices as maths', () => {
    const { container } = render(<Markdown text={'It costs $5 and $10 today.'} />);
    expect(container.querySelector('math')).toBeNull();
    expect(container.textContent).toBe('It costs $5 and $10 today.');
  });

  it('keeps maths safe: no links, scripts or event handlers survive', () => {
    const el = texToMathElement('\\href{javascript:alert(1)}{x} + y', false);
    const html = el?.outerHTML ?? '';
    expect(html).not.toMatch(/javascript:|href=|<script|onerror/i);
    expect(texToMathElement('\\frac{', false)).toBeNull();
  });

  it('parses horizontal rules', () => {
    expect(parseBlocks('a\n\n---\n\nb').map((b) => b.kind)).toEqual(['p', 'hr', 'p']);
  });
});
