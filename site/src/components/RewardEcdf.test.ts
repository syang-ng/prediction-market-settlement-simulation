import { describe, expect, it } from 'vitest';
import { niceCap } from './RewardEcdf';

describe('niceCap', () => {
  it('rounds up to 1 / 2 / 2.5 / 5 × 10^k', () => {
    expect(niceCap(0.66)).toBe(1);
    expect(niceCap(3.27)).toBe(5);
    expect(niceCap(16.32)).toBe(20);
    expect(niceCap(65.25)).toBe(100);
    expect(niceCap(2)).toBe(2);
    expect(niceCap(2.3)).toBe(2.5);
    expect(niceCap(0.11)).toBe(0.2);
  });

  it('falls back to one cent for non-positive input', () => {
    expect(niceCap(0)).toBe(0.01);
    expect(niceCap(NaN)).toBe(0.01);
  });
});
