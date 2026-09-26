import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { numberSliderSchema } from './a2ui-slider-catalog';
import { ClioNumberSlider } from './number-slider';
import { effectiveStep, snapToStep, stepDecimals } from './number-slider-values';

afterEach(cleanup);

const DENSITY = { min: 0, max: 1, step: 0.01 };

describe('number slider values', () => {
  it('snaps to the step grid from min and clamps to the range', () => {
    expect(snapToStep(0.304, DENSITY)).toBe(0.3);
    expect(snapToStep(0.306, DENSITY)).toBe(0.31);
    expect(snapToStep(1.7, DENSITY)).toBe(1);
    expect(snapToStep(-3, DENSITY)).toBe(0);
    expect(snapToStep(7, { min: 1, max: 20, step: 5 })).toBe(6);
  });

  it('shows as many decimals as the step implies', () => {
    expect(stepDecimals(0.01)).toBe(2);
    expect(stepDecimals(5)).toBe(0);
    expect(stepDecimals(1e-7)).toBe(7);
  });

  it('falls back to a hundredth of the range without a usable step', () => {
    expect(effectiveStep({ min: 0, max: 1 })).toBe(0.01);
    expect(effectiveStep({ min: 0, max: 1, step: 0 })).toBe(0.01);
    expect(effectiveStep({ min: 5, max: 5 })).toBe(1);
  });
});

describe('clio.slider.v1 adapter schema', () => {
  it('requires min and max and accepts a bound value', () => {
    expect(
      numberSliderSchema.safeParse({
        label: 'Density threshold',
        value: { path: '/iso' },
        ...DENSITY,
      }).success,
    ).toBe(true);
    expect(numberSliderSchema.safeParse({ label: 'x', value: 1, max: 2 }).success).toBe(false);
    expect(
      numberSliderSchema.safeParse({ label: 'x', value: 1, min: 0, max: 2, step: '0.1' }).success,
    ).toBe(false);
  });
});

describe('ClioNumberSlider', () => {
  it('writes a typed value on Enter, snapped to the step', () => {
    const setValue = vi.fn();
    render(
      <ClioNumberSlider label="Density threshold" setValue={setValue} value={0.3} {...DENSITY} />,
    );
    const box = screen.getByLabelText('Density threshold', { selector: 'input' });
    expect(box).toHaveValue('0.30');
    box.focus();
    fireEvent.change(box, { target: { value: '0.456' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(setValue).toHaveBeenCalledWith(0.46);
  });

  it('clamps a typed value outside the range to the nearest end', () => {
    const setValue = vi.fn();
    render(
      <ClioNumberSlider
        label="Scale"
        setValue={setValue}
        unit="×"
        value={2}
        min={0}
        max={10}
        step={0.5}
      />,
    );
    const box = screen.getByLabelText('Scale', { selector: 'input' });
    expect(box).toHaveValue('2.0');
    expect(screen.getByText('×')).toBeInTheDocument();
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '42' } });
    fireEvent.blur(box);
    expect(setValue).toHaveBeenCalledWith(10);
  });

  it('follows the bound value when it changes from outside', () => {
    const { rerender } = render(
      <ClioNumberSlider label="Cycle" value={3} min={0} max={40} step={1} />,
    );
    rerender(<ClioNumberSlider label="Cycle" value={12} min={0} max={40} step={1} />);
    expect(screen.getByLabelText('Cycle', { selector: 'input' })).toHaveValue('12');
  });
});
