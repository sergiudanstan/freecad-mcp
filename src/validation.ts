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

// ---------------------------------------------------------------------------
// Central schema-driven argument validation (runs before any handler builds Python).
// ---------------------------------------------------------------------------

const MAX_ARG_STRING_LENGTH = 4096;
const MAX_ARG_ARRAY_LENGTH = 10000;
const MAX_SHOWN_VALUE_LENGTH = 80;

interface ArgSchema {
  type?: string;
  enum?: unknown[];
  items?: ArgSchema;
  properties?: Record<string, ArgSchema>;
  required?: string[];
}

interface ToolLike {
  name: string;
  inputSchema: { properties?: Record<string, unknown>; required?: string[] };
}

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function showValue(value: unknown): string {
  let s: string | undefined;
  try {
    s = JSON.stringify(value);
  } catch {
    s = undefined;
  }
  if (s === undefined) s = String(value);
  return s.length > MAX_SHOWN_VALUE_LENGTH ? `${s.slice(0, MAX_SHOWN_VALUE_LENGTH - 3)}...` : s;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

class ArgChecker {
  constructor(private readonly tool: string) {}

  fail(path: string, reason: string, value?: unknown): never {
    const shown = arguments.length > 2 ? ` (got ${showValue(value)})` : '';
    throw new Error(`Invalid argument "${path}" for ${this.tool}: ${reason}${shown}`);
  }

  /** Finite number, boolean, or string within `maxLength`. */
  scalar(value: unknown, path: string, maxLength: number = MAX_ARG_STRING_LENGTH): void {
    if (typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) this.fail(path, 'must be a finite number', value);
      return;
    }
    if (typeof value === 'string') {
      if (value.length > maxLength) this.fail(path, `exceeds maximum length of ${maxLength} characters`, value);
      return;
    }
    this.fail(path, 'must be a number, boolean or string', value);
  }

  /** Validate the named properties of `obj`; unknown keys are rejected only when `strict`. */
  properties(obj: Record<string, unknown>, schema: ArgSchema, path: string, strict: boolean, unlimited?: string): void {
    const props = schema.properties ?? {};
    const prefix = path === '' ? '' : `${path}.`;
    for (const key of schema.required ?? []) {
      if (!hasOwn(obj, key) || obj[key] === undefined || obj[key] === null) {
        this.fail(`${prefix}${key}`, 'is required');
      }
    }
    for (const key of Object.keys(obj)) {
      if (!hasOwn(props, key)) {
        if (strict) this.fail(`${prefix}${key}`, 'is not an allowed property');
        continue;
      }
      const value = obj[key];
      if (value === undefined || value === null) continue;
      this.value(value, props[key] ?? {}, `${prefix}${key}`, key === unlimited ? Infinity : MAX_ARG_STRING_LENGTH);
    }
  }

  value(value: unknown, schema: ArgSchema, path: string, maxLength: number = MAX_ARG_STRING_LENGTH): void {
    switch (schema.type) {
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) this.fail(path, 'must be a finite number', value);
        break;
      case 'integer':
        if (!Number.isInteger(value)) this.fail(path, 'must be an integer', value);
        break;
      case 'boolean':
        if (typeof value !== 'boolean') this.fail(path, 'must be a boolean', value);
        break;
      case 'string':
        if (typeof value !== 'string') this.fail(path, 'must be a string', value);
        if (value.length > maxLength) this.fail(path, `exceeds maximum length of ${maxLength} characters`, value);
        break;
      case 'array':
        if (!Array.isArray(value)) this.fail(path, 'must be an array', value);
        if (value.length > MAX_ARG_ARRAY_LENGTH) this.fail(path, `exceeds maximum length of ${MAX_ARG_ARRAY_LENGTH} items`);
        value.forEach((item, i) => {
          if (schema.items) this.value(item, schema.items, `${path}[${i}]`);
          else this.scalar(item, `${path}[${i}]`);
        });
        break;
      case 'object':
        if (!isPlainObject(value)) this.fail(path, 'must be an object', value);
        if (schema.properties) {
          this.properties(value, schema, path, true);
        } else {
          for (const key of Object.keys(value)) this.scalar(value[key], `${path}.${key}`);
        }
        break;
      default:
        this.scalar(value, path, maxLength);
    }
    if (Array.isArray(schema.enum) && !schema.enum.some((e) => e === value)) {
      this.fail(path, `must be one of ${showValue(schema.enum)}`, value);
    }
  }
}

/**
 * Validate tool arguments against the tool's declared inputSchema before any code is built.
 * Throws `Unknown tool: <name>` or `Invalid argument "<path>" for <tool>: <reason>`.
 * Unknown top-level keys are ignored; no domain (min/max) checks are applied here.
 */
export function validateToolArgs(tools: readonly ToolLike[], name: string, args: unknown): void {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  const obj = args === undefined || args === null ? {} : args;
  if (!isPlainObject(obj)) throw new Error(`Invalid arguments for ${name}: must be an object`);
  const unlimited = name === 'freecad_execute_python' ? 'code' : undefined;
  new ArgChecker(name).properties(obj, tool.inputSchema as ArgSchema, '', false, unlimited);
}
