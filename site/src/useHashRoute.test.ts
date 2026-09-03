import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from './useHashRoute';

describe('parseHash', () => {
  it('treats the empty hash and page anchors as the default route', () => {
    expect(parseHash('').path).toBe('/');
    expect(parseHash('').params.toString()).toBe('');
    expect(parseHash('#simulation').path).toBe('/');
    expect(parseHash('#top').path).toBe('/');
  });

  it('parses the counterfactual route and its query', () => {
    const route = parseHash('#/counterfactual?round=10253&oi=1000000');
    expect(route.path).toBe('/counterfactual');
    expect(route.params.get('round')).toBe('10253');
    expect(route.params.get('oi')).toBe('1000000');
  });

  it('routes the method tab and the legacy #method anchor', () => {
    expect(parseHash('#/method').path).toBe('/method');
    expect(parseHash('#method').path).toBe('/method');
    expect(parseHash('#methods').path).toBe('/');
  });

  it('tolerates trailing slashes, keeps default-route queries, and falls back for unknown routes', () => {
    expect(parseHash('#/counterfactual/').path).toBe('/counterfactual');
    expect(parseHash('#/?attempt=em_1').params.get('attempt')).toBe('em_1');
    expect(parseHash('#/nope?x=1').path).toBe('/');
  });
});

describe('formatHash', () => {
  it('omits an empty query', () => {
    expect(formatHash('/', new URLSearchParams())).toBe('#/');
    expect(formatHash('/counterfactual', new URLSearchParams({ round: '9720' }))).toBe('#/counterfactual?round=9720');
  });
});
