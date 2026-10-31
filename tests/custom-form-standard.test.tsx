import fs from 'node:fs';
import path from 'node:path';
import React, { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it, vi } from 'vitest';

import customFormJson from '../forms/custom-form.json';
import {
  ALL_BUILT_IN_FIELD_TYPES,
  createFormBuilder,
  createStarterFormTemplate,
  EXPO_FORM_SCHEMA_URI,
  ExpoForm,
  parseFormJson,
  validateFormStandard,
  type ExpoFormRef,
} from '../src';

describe('Custom form.json Authoring Standard, Meta-Schema & Live Generation', () => {
  it('validates all repository forms/*.json against schema/expo-form.schema.json and covers all 88 types', () => {
    const schemaPath = path.resolve(__dirname, '../schema/expo-form.schema.json');
    const metaSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

    const schemaBuiltInEnum: string[] = metaSchema.$defs.BuiltInFieldType.enum;
    expect(schemaBuiltInEnum.length).toBe(ALL_BUILT_IN_FIELD_TYPES.length);
    for (const fieldType of ALL_BUILT_IN_FIELD_TYPES) {
      expect(schemaBuiltInEnum).toContain(fieldType);
    }

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(metaSchema);

    const formsDir = path.resolve(__dirname, '../forms');
    const jsonFiles = fs.readdirSync(formsDir).filter((f) => f.endsWith('.json'));
    expect(jsonFiles.length).toBeGreaterThanOrEqual(10);

    for (const file of jsonFiles) {
      const formObj = JSON.parse(fs.readFileSync(path.join(formsDir, file), 'utf8'));
      const ok = validate(formObj);
      expect(ok, `Expected ${file} to satisfy expo-form.schema.json: ${JSON.stringify(validate.errors)}`).toBe(
        true
      );
    }
  });

  it('catches standard violations clearly via validateFormStandard & parseFormJson', () => {
    // 1. Malformed JSON syntax string
    const badJson = validateFormStandard('{ "id": "broken", ');
    expect(badJson.valid).toBe(false);
    expect(badJson.errors[0]?.path).toBe('json');

    // 2. Missing id and missing fields/sections/steps
    const emptyObj = validateFormStandard({});
    expect(emptyObj.valid).toBe(false);
    expect(emptyObj.errors.some((e) => e.path === 'config.id')).toBe(true);
    expect(emptyObj.errors.some((e) => e.path === 'config.fields')).toBe(true);

    // 3. Input field missing "name", computed missing formula, repeater missing child fields, unknown type in strict mode
    const invalidFields = validateFormStandard(
      {
        id: 'bad-fields',
        fields: [
          { type: 'email', label: 'Nameless Email' },
          { name: 'total', type: 'computed' },
          { name: 'items', type: 'repeater' },
          { name: 'mystery', type: 'nonExistentWidget' },
        ],
      },
      { strictFieldTypes: true }
    );
    expect(invalidFields.valid).toBe(false);
    expect(invalidFields.errors.some((e) => e.path === 'config.fields[0].name')).toBe(true);
    expect(invalidFields.errors.some((e) => e.path === 'config.fields[1].computed')).toBe(true);
    expect(invalidFields.errors.some((e) => e.path === 'config.fields[2].fields')).toBe(true);
    expect(invalidFields.errors.some((e) => e.path === 'config.fields[3].type')).toBe(true);

    // 4. Rejects executable JS functions embedded inside config
    const withFunction = validateFormStandard({
      id: 'unsafe-fn',
      fields: [{ name: 'email', type: 'email' }],
      onHack: () => {},
    });
    expect(withFunction.valid).toBe(false);
    expect(withFunction.errors.some((e) => e.path === 'config.onHack')).toBe(true);
  });

  it('generates standard-compliant form.json strings via createFormBuilder and starter templates', () => {
    const jsonString = createFormBuilder('vendor-onboarding')
      .version('1.2.0')
      .title('Vendor Registration')
      .description('Generated via FormConfigBuilder')
      .defaults({ country: 'PK' })
      .addField({
        name: 'companyName',
        type: 'organization',
        label: 'Company Name',
        required: true,
      })
      .addField({
        name: 'contactEmail',
        type: 'email',
        label: 'Contact Email',
        required: true,
      })
      .submit({ label: 'Register Vendor', showReset: true })
      .toJsonString();

    const parsed = parseFormJson(jsonString, { strictFieldTypes: true });
    expect(parsed.valid).toBe(true);
    expect(parsed.config?.$schema).toBe(EXPO_FORM_SCHEMA_URI);
    expect(parsed.config?.id).toBe('vendor-onboarding');

    for (const kind of ['blank', 'login', 'contact', 'wizard'] as const) {
      const tpl = createStarterFormTemplate(kind);
      expect(validateFormStandard(tpl, { strictFieldTypes: true }).valid).toBe(true);
    }
  });

  it('renders a raw custom form.json string directly in <ExpoForm />, live-updates on JSON edits, and submits', async () => {
    const onSubmit = vi.fn();
    const formRef = createRef<ExpoFormRef>();

    const customJsonV1 = JSON.stringify({
      $schema: EXPO_FORM_SCHEMA_URI,
      id: 'user-authored-form',
      title: 'Custom Feedback Form',
      fields: [
        { name: 'customerName', type: 'fullName', label: 'Customer Name', required: true },
        { name: 'customerEmail', type: 'email', label: 'Customer Email', required: true },
      ],
      submit: { label: 'Send Custom Form' },
    });

    const { rerender } = render(
      <ExpoForm ref={formRef} config={customJsonV1} onSubmit={onSubmit} />
    );

    expect(screen.getByText('Custom Feedback Form')).toBeTruthy();
    expect(screen.getByText('Customer Name')).toBeTruthy();

    // User edits their custom form.json to add a new field with defaultValue
    const customJsonV2 = JSON.stringify({
      $schema: EXPO_FORM_SCHEMA_URI,
      id: 'user-authored-form',
      title: 'Custom Feedback Form v2',
      fields: [
        { name: 'customerName', type: 'fullName', label: 'Customer Name', required: true },
        { name: 'customerEmail', type: 'email', label: 'Customer Email', required: true },
        {
          name: 'department',
          type: 'text',
          label: 'Target Department',
          defaultValue: 'Product Engineering',
        },
      ],
      submit: { label: 'Send Custom Form' },
    });

    rerender(<ExpoForm ref={formRef} config={customJsonV2} onSubmit={onSubmit} />);

    expect(screen.getByText('Custom Feedback Form v2')).toBeTruthy();
    expect(screen.getByText('Target Department')).toBeTruthy();
    expect(formRef.current?.getValue('department')).toBe('Product Engineering');

    act(() => {
      formRef.current?.setValues({
        customerName: 'Ahmad Khan',
        customerEmail: 'ahmad@1stfold.com',
      });
    });

    await act(async () => {
      await formRef.current?.submit();
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      customerName: 'Ahmad Khan',
      customerEmail: 'ahmad@1stfold.com',
      department: 'Product Engineering',
    });

    // Also verify forms/custom-form.json starter file parses cleanly
    expect(parseFormJson(customFormJson).valid).toBe(true);
  });
});
