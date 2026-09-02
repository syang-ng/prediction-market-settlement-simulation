/**
 * Floating-point helpers ported from experiments/greedy_reward_simulation.py.
 *
 * Every function uses only IEEE-754 operations whose results are identical
 * across JavaScript engines (+ − × ÷, comparisons, integer bit operations), so
 * the simulation is reproducible on any machine.
 */

const scratch = new Float64Array(1);
const words = new Uint32Array(scratch.buffer);
scratch[0] = 1;
// Index of the low-order 32-bit word of a double on this platform.
const LOW = words[0] === 0 ? 0 : 1;
const HIGH = 1 - LOW;

/** Next representable double toward +Infinity; mirrors numpy.nextafter(x, inf). */
export function nextUp(x: number): number {
  if (Number.isNaN(x) || x === Infinity) return x;
  if (x === 0) return Number.MIN_VALUE;
  scratch[0] = x;
  if (x > 0) {
    if (words[LOW] === 0xffffffff) {
      words[LOW] = 0;
      words[HIGH] += 1;
    } else {
      words[LOW] += 1;
    }
  } else if (words[LOW] === 0) {
    words[LOW] = 0xffffffff;
    words[HIGH] -= 1;
  } else {
    words[LOW] -= 1;
  }
  return scratch[0];
}

/** One Kahan step (Python compensated_add): returns [updated total, new correction]. */
export function compensatedAdd(total: number, correction: number, increment: number): [number, number] {
  const adjusted = increment - correction;
  const updated = total + adjusted;
  return [updated, updated - total - adjusted];
}

/** Kahan total in input order; equals Python stable_cumsum_last_axis(values)[-1]. */
export function kahanTotal(values: ArrayLike<number>): number {
  let total = 0;
  let correction = 0;
  for (let i = 0; i < values.length; i += 1) {
    const adjusted = values[i] - correction;
    const updated = total + adjusted;
    correction = updated - total - adjusted;
    total = updated;
  }
  return total;
}

/** Strict coverage with a one-ulp allowance for summation roundoff (Python coverage_reached). */
export function coverageReached(totalStakeUma: number, requiredStakeUma: number): boolean {
  return totalStakeUma >= requiredStakeUma || nextUp(totalStakeUma) >= requiredStakeUma;
}
