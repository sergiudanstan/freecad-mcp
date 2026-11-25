import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateNumber,
  validatePositiveNumber,
  validateString,
  validateObjectName,
  validateFilePath,
  validateArray,
  escapePythonString,
} from '../dist/validation.js';

test('validateNumber accepts finite numbers and enforces bounds', () => {
  assert.equal(validateNumber(5, 'x', { min: 0, max: 10 }), 5);
  assert.throws(() => validateNumber(NaN, 'x'), /finite/);
  assert.throws(() => validateNumber(Infinity, 'x'), /finite/);
  assert.throws(() => validateNumber('5', 'x'), /finite/);
  assert.throws(() => validateNumber(-1, 'x', { min: 0 }), /below minimum/);
  assert.throws(() => validateNumber(11, 'x', { max: 10 }), /exceeds maximum/);
  assert.throws(() => validateNumber(0, 'x', { allowZero: false }), /zero/);
});

test('validatePositiveNumber rejects zero and negatives', () => {
  assert.equal(validatePositiveNumber(1, 'r'), 1);
  assert.throws(() => validatePositiveNumber(0, 'r'));
  assert.throws(() => validatePositiveNumber(-3, 'r'));
  assert.throws(() => validatePositiveNumber(2e6, 'r'), /exceeds maximum/);
});

test('validateString enforces type, emptiness and length', () => {
  assert.equal(validateString('abc', 's'), 'abc');
  assert.throws(() => validateString(1, 's'), /string/);
  assert.throws(() => validateString('', 's'), /empty/);
  assert.throws(() => validateString('x'.repeat(1025), 's'), /maximum length/);
});

test('validateObjectName rejects characters that could break out of a Python string', () => {
  assert.equal(validateObjectName('Box_1', 'n'), 'Box_1');
  for (const bad of ['1Box', 'a"b', "a'b", 'a;b', 'a\nb', 'a)b', 'a.b']) {
    assert.throws(() => validateObjectName(bad, 'n'), /invalid characters/, bad);
  }
});

test('validateFilePath accepts absolute paths and blocks the rest', () => {
  assert.equal(validateFilePath('/tmp/a.step', 'p'), '/tmp/a.step');
  assert.equal(validateFilePath('C:\\work\\a.step', 'p'), 'C:\\work\\a.step');
  assert.throws(() => validateFilePath('a.step', 'p'), /absolute/);
  assert.throws(() => validateFilePath('/tmp/../etc/x', 'p'), /traversal/);
  assert.throws(() => validateFilePath('C:\\a\\..\\b', 'p'), /traversal/);
  assert.throws(() => validateFilePath('/etc/passwd', 'p'), /not allowed/);
  assert.throws(() => validateFilePath('/PROC/self/environ', 'p'), /not allowed/);
  assert.throws(() => validateFilePath('/tmp/a\0b', 'p'), /null/);
});

test('validateArray enforces type, emptiness and length', () => {
  assert.deepEqual(validateArray([1], 'a'), [1]);
  assert.throws(() => validateArray('x', 'a'), /array/);
  assert.throws(() => validateArray([], 'a'), /empty/);
  assert.throws(() => validateArray([1, 2, 3], 'a', 2), /maximum length/);
});

test('escapePythonString neutralises quotes, backslashes and newlines', () => {
  assert.equal(escapePythonString('a"b'), 'a\\"b');
  assert.equal(escapePythonString('a\\b'), 'a\\\\b');
  assert.equal(escapePythonString('a\nb\rc'), 'a\\nb\\rc');
  assert.equal(escapePythonString('a\0b'), 'ab');
  // an attempted breakout stays inside the string literal
  assert.equal(escapePythonString('"; import os #'), '\\"; import os #');
});
