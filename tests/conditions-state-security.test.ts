import { describe, expect, it, vi } from 'vitest';

import { evaluateComputedField } from '../src/conditions/computed';
import { evaluateCondition } from '../src/conditions/evaluator';
import { parseAndValidateFormConfig } from '../src/core/configParser';
import {
  ALL_BUILT_IN_FIELD_TYPES,
  collectSensitiveFieldPaths,
  defaultFieldRegistry,
  FormStore,
  omitSensitiveValues,
  redactSensitiveForLog,
  validateSelectedFiles,
  type FormConfig,
} from '../src';

describe('Conditions, Computed Fields, Security, Uploads & Config Parser', () => {
  it('evaluates simple and nested boolean condition trees accurately', () => {
    const values = {
      country: 'PK',
      age: 24,
      roles: ['admin', 'editor'],
      company: '1stFold',
      notes: '',
    };

    expect(evaluateCondition({ field: 'country', equals: 'PK' }, values)).toBe(true);
    expect(evaluateCondition({ field: 'country', notEquals: 'US' }, values)).toBe(true);
    expect(evaluateCondition({ field: 'country', in: ['PK', 'AE'] }, values)).toBe(true);
    expect(evaluateCondition({ field: 'age', gte: 18 }, values)).toBe(true);
    expect(evaluateCondition({ field: 'roles', contains: 'admin' }, values)).toBe(true);
    expect(evaluateCondition({ field: 'notes', isEmpty: true }, values)).toBe(true);
    expect(evaluateCondition({ field: 'company', matches: '^1st' }, values)).toBe(true);

    expect(
      evaluateCondition(
        {
          and: [
            { field: 'country', equals: 'PK' },
            {
              or: [
                { field: 'age', lt: 18 },
                { field: 'roles', contains: 'admin' },
              ],
            },
            { not: { field: 'notes', isNotEmpty: true } },
          ],
        },
        values
      )
    ).toBe(true);
  });

  it('computes derived values declaratively without eval()', () => {
    const vals = {
      firstName: 'Ahmad',
      lastName: 'Khan',
      qty: 3,
      unitPrice: 19.99,
      tax: 5.03,
    };

    expect(
      evaluateComputedField(
        { operation: 'concat', fields: ['firstName', 'lastName'], separator: ' ' },
        vals
      )
    ).toBe('Ahmad Khan');

    expect(
      evaluateComputedField(
        { operation: 'multiply', fields: ['qty', 'unitPrice'], precision: 2 },
        vals
      )
    ).toBe(59.97);

    expect(
      evaluateComputedField(
        { operation: 'sum', fields: ['unitPrice', 'tax'], precision: 2 },
        vals
      )
    ).toBe(25.02);

    expect(
      evaluateComputedField(
        { operation: 'template', template: 'Hello, {{firstName}} {{lastName}}!' },
        vals
      )
    ).toBe('Hello, Ahmad Khan!');
  });

  it('protects sensitive fields from logging, draft persistence, and clears them on reset', async () => {
    const savedDrafts: Record<string, string> = {};
    const storageAdapter = {
      getItem: vi.fn((k: string) => savedDrafts[k] ?? null),
      setItem: vi.fn((k: string, v: string) => {
        savedDrafts[k] = v;
      }),
      removeItem: vi.fn((k: string) => {
        delete savedDrafts[k];
      }),
    };

    const config: FormConfig = {
      id: 'secure-draft-form',
      fields: [
        { name: 'email', type: 'email', label: 'Email' },
        { name: 'password', type: 'password', label: 'Password' },
        { name: 'secretToken', type: 'text', label: 'Secret Token', sensitive: true },
      ],
      persistence: {
        enabled: true,
        key: 'draft:secure',
        debounceMs: 0,
      },
      security: {
        protectSensitiveFields: true,
        clearSensitiveOnReset: true,
      },
    };

    const sensitiveSet = collectSensitiveFieldPaths(config);
    expect(sensitiveSet.has('password')).toBe(true);
    expect(sensitiveSet.has('secretToken')).toBe(true);
    expect(sensitiveSet.has('email')).toBe(false);

    const rawValues = {
      email: 'user@example.com',
      password: 'MySecretPassword!123',
      secretToken: 'tok_live_999',
    };

    const redacted = redactSensitiveForLog(rawValues, sensitiveSet);
    expect(redacted.email).toBe('user@example.com');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.secretToken).toBe('[REDACTED]');

    const safeDraft = omitSensitiveValues(rawValues, sensitiveSet);
    expect(safeDraft).toEqual({ email: 'user@example.com' });

    const store = new FormStore({
      config,
      storageAdapter,
    });
    store.setValue('email', 'user@example.com');
    store.setValue('password', 'MySecretPassword!123');
    store.setValue('secretToken', 'tok_live_999');

    await new Promise((r) => setTimeout(r, 25));
    expect(storageAdapter.setItem).toHaveBeenCalled();
    const persistedJson = JSON.parse(savedDrafts['draft:secure']);
    expect(persistedJson.email).toBe('user@example.com');
    expect(persistedJson.password).toBeUndefined();
    expect(persistedJson.secretToken).toBeUndefined();

    // Reset clears sensitive fields
    store.reset();
    expect(store.getValue('password')).toBe('');
    expect(store.getValue('secretToken')).toBe('');
  });

  it('validates uploaded file MIME types, extensions, sizes, and max counts', () => {
    const check = validateSelectedFiles(
      [
        {
          id: '1',
          name: 'avatar.png',
          uri: 'file:///avatar.png',
          mimeType: 'image/png',
          size: 512_000,
          extension: '.png',
        },
        {
          id: '2',
          name: 'malware.exe',
          uri: 'file:///malware.exe',
          mimeType: 'application/x-msdownload',
          size: 1024,
          extension: '.exe',
        },
        {
          id: '3',
          name: 'huge.png',
          uri: 'file:///huge.png',
          mimeType: 'image/png',
          size: 20 * 1024 * 1024,
          extension: '.png',
        },
      ],
      {
        allowedMimeTypes: ['image/png', 'image/jpeg'],
        allowedExtensions: ['.png', '.jpg'],
        maxFileSize: 5 * 1024 * 1024,
        maxFiles: 2,
      }
    );

    expect(check.accepted).toHaveLength(1);
    expect(check.accepted[0].name).toBe('avatar.png');
    expect(check.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('parses valid JSON configs and catches malformed schemas, duplicate names, and bad regexes', () => {
    const broken = parseAndValidateFormConfig({
      id: '',
      fields: [
        { name: 'email', type: 'email' },
        { name: 'email', type: 'text' },
        {
          name: 'code',
          type: 'text',
          validation: { regex: { pattern: '[unclosed-regex' } },
        },
      ],
    });
    expect(broken.hasFatalError).toBe(true);
    expect(broken.issues.some((i) => i.message.includes('Duplicate'))).toBe(true);
    expect(broken.issues.some((i) => i.message.includes('Invalid regular expression'))).toBe(true);

    // Every single one of the 88 built-in field types is registered in FieldRegistry
    expect(ALL_BUILT_IN_FIELD_TYPES.length).toBe(88);
    for (const type of ALL_BUILT_IN_FIELD_TYPES) {
      expect(defaultFieldRegistry.has(type)).toBe(true);
    }
  });
});
