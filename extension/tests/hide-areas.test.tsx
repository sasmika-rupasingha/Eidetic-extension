// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { areaBetween, areaToBox, boxToArea, centreArea, clampArea, MIN_AREA, nudgeArea } from '../src/privacy/areas';
import { HideAreas } from '../src/ui/shared/HideAreas';

describe('areas to hide', () => {
  it('builds an area from a drag in any direction and ignores stray clicks', () => {
    const a = areaBetween({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 })!;
    expect([a.x, a.y, a.w, a.h].map((v) => Number(v.toFixed(6)))).toEqual([0.2, 0.1, 0.4, 0.4]);
    expect(areaBetween({ x: 0.5, y: 0.5 }, { x: 0.502, y: 0.6 })).toBeNull();
    expect(areaBetween({ x: -0.5, y: 0.2 }, { x: 0.3, y: 1.4 })).toEqual({ x: 0, y: 0.2, w: 0.3, h: 0.8 });
  });

  it('moves and resizes with the arrow keys without leaving the image', () => {
    const a = { x: 0.98, y: 0, w: 0.02, h: 0.1 };
    expect(nudgeArea(a, 'ArrowRight', false)).toEqual(a); // already at the right edge
    expect(nudgeArea(a, 'ArrowUp', false)?.y).toBe(0);
    expect(nudgeArea({ x: 0.1, y: 0.1, w: MIN_AREA, h: 0.1 }, 'ArrowLeft', true)?.w).toBe(MIN_AREA);
    expect(nudgeArea(a, 'Tab', false)).toBeNull();
    expect(clampArea({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 })).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it('converts between image pixels and fractions, covering every pixel of the area', () => {
    expect(areaToBox({ x: 0.1, y: 0.25, w: 0.5, h: 0.5 }, 801, 400)).toEqual({ x0: 80, y0: 100, x1: 481, y1: 300 });
    const back = boxToArea({ x0: 100, y0: 50, x1: 300, y1: 150 }, 1000, 500);
    expect(back).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });
});

describe('Hide part of the image', () => {
  const setup = () => {
    const onDownload = vi.fn(async () => undefined);
    render(<HideAreas imgUrl={null} width={1000} height={500} detected={[{ x0: 10, y0: 10, x1: 60, y1: 30 }]} onDownload={onDownload} onClose={() => undefined} />);
    return { onDownload, stage: screen.getByTestId('hide-stage') };
  };

  it('works with the keyboard alone: add, move, resize, remove', () => {
    const { stage } = setup();
    fireEvent.keyDown(stage, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Area 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('30 × 15 % of the image')).toBeTruthy();
    fireEvent.keyDown(stage, { key: 'ArrowRight', shiftKey: true });
    expect(screen.getByText('31 × 15 % of the image')).toBeTruthy();
    fireEvent.keyDown(stage, { key: 'Delete' });
    expect(screen.queryByRole('button', { name: 'Area 1' })).toBeNull();
  });

  it('downloads the drawn areas in image pixels with the chosen style, counting detected details too', async () => {
    const { stage, onDownload } = setup();
    expect(screen.getByTestId('hide-download').textContent).toContain('(1 area)');
    fireEvent.keyDown(stage, { key: 'Enter' });
    fireEvent.click(screen.getByRole('radio', { name: 'Pixelate' }));
    fireEvent.click(screen.getByTestId('hide-download'));
    const c = centreArea();
    expect(onDownload).toHaveBeenCalledWith([areaToBox(c, 1000, 500)], 'pixelate');
    expect(screen.getByTestId('hide-download').textContent).toContain('(2 areas)');
  });
});
