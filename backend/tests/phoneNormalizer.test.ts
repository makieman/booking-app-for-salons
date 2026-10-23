import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKenyanPhone } from '../utils/phoneNormalizer';

describe('Kenyan Phone Normalizer', () => {
  it('normalizes standard 10-digit 07xx numbers', () => {
    assert.strictEqual(normalizeKenyanPhone('0712345678'), '+254712345678');
    assert.strictEqual(normalizeKenyanPhone('0722000000'), '+254722000000');
    assert.strictEqual(normalizeKenyanPhone('0799999999'), '+254799999999');
  });

  it('normalizes standard 10-digit 01xx numbers', () => {
    assert.strictEqual(normalizeKenyanPhone('0112345678'), '+254112345678');
    assert.strictEqual(normalizeKenyanPhone('0100000000'), '+254100000000');
  });

  it('normalizes 9-digit 7xx and 1xx numbers (without leading 0)', () => {
    assert.strictEqual(normalizeKenyanPhone('712345678'), '+254712345678');
    assert.strictEqual(normalizeKenyanPhone('112345678'), '+254112345678');
  });

  it('normalizes 12-digit 2547xx and 2541xx numbers', () => {
    assert.strictEqual(normalizeKenyanPhone('254712345678'), '+254712345678');
    assert.strictEqual(normalizeKenyanPhone('254112345678'), '+254112345678');
  });

  it('preserves valid +2547xx and +2541xx numbers', () => {
    assert.strictEqual(normalizeKenyanPhone('+254712345678'), '+254712345678');
    assert.strictEqual(normalizeKenyanPhone('+254112345678'), '+254112345678');
  });

  it('strips spaces, hyphens, and parentheses cleanly', () => {
    assert.strictEqual(normalizeKenyanPhone('0712 345 678'), '+254712345678');
    assert.strictEqual(normalizeKenyanPhone('+254 712-345-678'), '+254712345678');
    assert.strictEqual(normalizeKenyanPhone('(0712) 345 678'), '+254712345678');
    assert.strictEqual(normalizeKenyanPhone('  0712.345.678  '), '+254712345678');
    assert.strictEqual(normalizeKenyanPhone('  +254 112 345 678  '), '+254112345678');
  });

  it('rejects invalid or non-Kenyan phone formats', () => {
    assert.strictEqual(normalizeKenyanPhone(''), null);
    assert.strictEqual(normalizeKenyanPhone(null), null);
    assert.strictEqual(normalizeKenyanPhone(undefined), null);
    assert.strictEqual(normalizeKenyanPhone('12345'), null);
    assert.strictEqual(normalizeKenyanPhone('0812345678'), null); // not 07 or 01
    assert.strictEqual(normalizeKenyanPhone('+14155552671'), null); // US number
    assert.strictEqual(normalizeKenyanPhone('071234567899'), null); // too long
    assert.strictEqual(normalizeKenyanPhone('abcdefghij'), null);
  });
});
