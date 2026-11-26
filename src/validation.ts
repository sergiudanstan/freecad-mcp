/**
 * Input validation utilities for freecad-mcp.
 *
 * Provides runtime type checking, range validation, string sanitization,
 * and file path traversal prevention for all tool inputs.
 */

/** A JavaScript boolean as a Python literal, for code sent to FreeCAD. */
export function pyBool(value: unknown): 'True' | 'False' {
  return value ? 'True' : 'False';
}

const MAX_DIMENSION = 1e6; // 1,000,000 mm = 1 km
const MAX_STRING_LENGTH = 1024;
const MAX_OBJECT_NAME_LENGTH = 256;

/**
 * Validate that a value is a finite number within an acceptable range.
 * Throws if the value is not a number, NaN, Infinity, or out of range.
 */
export function validateNumber(
  value: unknown,
  name: string,
  options: { min?: number; max?: number; allowZero?: boolean } = {},
): number {
  const { min, max, allowZero = true } = options;

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid ${name}: must be a finite number, got ${typeof value === 'number' ? value : typeof value}`);
  }

  if (!allowZero && value === 0) {
    throw new Error(`Invalid ${name}: must not be zero`);
  }

  if (min !== undefined && value < min) {
    throw new Error(`Invalid ${name}: ${value} is below minimum ${min}`);
  }

  if (max !== undefined && value > max) {
    throw new Error(`Invalid ${name}: ${value} exceeds maximum ${max}`);
  }

  return value;
}

/**
 * Validate a positive number (> 0) within dimension limits.
 * Used for radii, lengths, heights, distances.
 */
export function validatePositiveNumber(value: unknown, name: string, max: number = MAX_DIMENSION): number {
  return validateNumber(value, name, { min: Number.EPSILON, max });
}

/**
 * Validate a non-negative number (>= 0) within dimension limits.
 * Used for values that can be zero (e.g., cone top radius).
 */
export function validateNonNegativeNumber(value: unknown, name: string, max: number = MAX_DIMENSION): number {
  return validateNumber(value, name, { min: 0, max });
}

/**
 * Validate a string input: type check, length limit, and sanitization.
 */
export function validateString(value: unknown, name: string, maxLength: number = MAX_STRING_LENGTH): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${name}: must be a string, got ${typeof value}`);
  }

  if (value.length === 0) {
    throw new Error(`Invalid ${name}: must not be empty`);
  }

  if (value.length > maxLength) {
    throw new Error(`Invalid ${name}: exceeds maximum length of ${maxLength} characters`);
  }

  return value;
}

/**
 * Validate a FreeCAD object name: alphanumeric, underscores, reasonable length.
 */
export function validateObjectName(value: unknown, name: string): string {
  const s = validateString(value, name, MAX_OBJECT_NAME_LENGTH);

  if (!/^[A-Za-z_][A-Za-z0-9_ ]*$/.test(s)) {
    throw new Error(`Invalid ${name}: "${s}" contains invalid characters. Use alphanumeric, underscores, and spaces only.`);
  }

  return s;
}

/**
 * Escape a string for safe embedding in Python code.
 * Handles backslashes, quotes, newlines, carriage returns, and null bytes.
 */
export function escapePythonString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '');
}

/**
 * Validate a file path for safety.
 * Prevents path traversal attacks and null byte injection.
 * Requires absolute paths and blocks suspicious patterns.
 */
export function validateFilePath(value: unknown, name: string): string {
  const s = validateString(value, name, 4096);

  // Block null bytes
  if (s.includes('\0')) {
    throw new Error(`Invalid ${name}: path contains null bytes`);
  }

  // Require absolute path
  if (!s.startsWith('/') && !s.match(/^[A-Za-z]:\\/)) {
    throw new Error(`Invalid ${name}: must be an absolute path`);
  }

  // Block path traversal
  const normalized = s.replace(/\\/g, '/');
  if (normalized.includes('/../') || normalized.endsWith('/..') || normalized.startsWith('../')) {
    throw new Error(`Invalid ${name}: path traversal detected`);
  }

  // Block sensitive system paths
  const blocked = ['/etc/', '/proc/', '/sys/', '/dev/', '/var/run/', '/var/log/'];
  const lower = normalized.toLowerCase();
  for (const prefix of blocked) {
    if (lower.startsWith(prefix)) {
      throw new Error(`Invalid ${name}: access to ${prefix} is not allowed`);
    }
  }

  return s;
}

/**
 * Validate an array input with length constraints.
 */
export function validateArray(value: unknown, name: string, maxLength: number = 10000): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${name}: must be an array, got ${typeof value}`);
  }

  if (value.length === 0) {
    throw new Error(`Invalid ${name}: must not be empty`);
  }

  if (value.length > maxLength) {
    throw new Error(`Invalid ${name}: exceeds maximum length of ${maxLength} items`);
  }

  return value;
}
