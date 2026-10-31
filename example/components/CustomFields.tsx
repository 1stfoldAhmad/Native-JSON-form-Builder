import React from 'react';
import { Row, Text, TextInput, useNativeState } from '@expo/ui';

import type { AsyncFieldValidator, FieldComponent, FieldRendererProps } from './expo-form';

/**
 * Custom registered field renderer (`type: "promoCode"`), demonstrating how teams can
 * extend `ExpoForm` without modifying core library code.
 */
export function PromoCodeField({
  value,
  onChange,
  onBlur,
  disabled,
  styles,
}: FieldRendererProps<string>) {
  const codeState = useNativeState(value ?? '');
  const normalized = (value ?? '').trim().toUpperCase();
  const isVerified = normalized === 'EXPO58' || normalized === 'SAVE20';

  return (
    <Row spacing={8} alignment="center" style={{ width: '100%' }}>
      <TextInput
        value={codeState}
        placeholder="Try EXPO58 or SAVE20"
        editable={!disabled}
        autoCapitalize="characters"
        style={{ ...styles.inputStyle, width: '68%' }}
        textStyle={styles.inputTextStyle}
        onChangeText={(next) => onChange(next.toUpperCase())}
        onBlur={onBlur}
      />
      <Text
        textStyle={{
          fontSize: 12,
          fontWeight: '600',
          color: isVerified ? '#16A34A' : '#64748B',
        }}
      >
        {isVerified ? '20% OFF Applied' : 'Enter code'}
      </Text>
    </Row>
  );
}

export const DEMO_CUSTOM_FIELDS: Record<string, FieldComponent> = {
  promoCode: PromoCodeField as FieldComponent,
};

export const DEMO_ASYNC_VALIDATORS: Record<string, AsyncFieldValidator> = {
  checkUsernameAvailable: async ({ value }) => {
    await new Promise((resolve) => setTimeout(resolve, 220));
    const reserved = new Set(['admin', 'root', 'support', 'taken']);
    return reserved.has(String(value).toLowerCase())
      ? 'That username is reserved — try another handle'
      : true;
  },
  checkEmailAvailable: async ({ value }) => {
    await new Promise((resolve) => setTimeout(resolve, 220));
    return String(value).toLowerCase() === 'taken@example.com'
      ? 'An account with taken@example.com already exists'
      : true;
  },
};
