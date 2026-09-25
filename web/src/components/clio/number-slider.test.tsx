import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { numberSliderSchema } from './a2ui-slider-catalog';
import { ClioNumberSlider } from './number-slider';
import {
  effectiveStep,
  formatSliderValue,
  parseTypedValue,
  snapToStep,
  stepDecimals,
} from './number-slider-values';

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
    expect(formatSliderValue(0.3, DENSITY)).toBe('0.30');
  });

  it('falls back to a hundredth of the range without a usable step', () => {
    expect(effectiveStep({ min: 0, max: 1 })).toBe(0.01);
    expect(effectiveStep({ min: 0, max: 1, step: 0 })).toBe(0.01);
    expect(effectiveStep({ min: 5, max: 5 })).toBe(1);
  });

  it('parses typed numbers, including a decimal comma, and rejects text', () => {
    expect(parseTypedValue(' 0.457 ', DENSITY)).toBe(0.46);
    expect(parseTypedValue('0,45', DENSITY)).toBe(0.45);
    expect(parseTypedValue('.5', DENSITY)).toBe(0.5);
    expect(parseTypedValue('2', DENSITY)).toBe(1);
    expect(parseTypedValue('abc', DENSITY)).toBeUndefined();
    expect(parseTypedValue('', DENSITY)).toBeUndefined();
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
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '0.456' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(setValue).toHaveBeenCalledWith(0.46);
  });

  it('says what went wrong for text that is not a number, and does not write it', () => {
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
    fireEvent.change(box, { target: { value: 'lots' } });
    fireEvent.blur(box);
    expect(screen.getByText('Enter a number from 0.0 to 10.0.')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(setValue).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box).toHaveValue('2.0');
  });

  it('follows the bound value when it changes from outside', () => {
    const { rerender } = render(
      <ClioNumberSlider label="Cycle" value={3} min={0} max={40} step={1} />,
    );
    rerender(<ClioNumberSlider label="Cycle" value={12} min={0} max={40} step={1} />);
    expect(screen.getByLabelText('Cycle', { selector: 'input' })).toHaveValue('12');
  });
});
