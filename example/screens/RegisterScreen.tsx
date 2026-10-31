import React from 'react';

import { ExpoForm, type FormConfig } from '@/components/expo-form';
import registerForm from '../../forms/register.json';

/**
 * Minimal single-component registration screen driven entirely by JSON.
 */
export default function RegisterScreen() {
  return (
    <ExpoForm
      config={registerForm as unknown as FormConfig}
      onSubmit={async (_values) => {
        // Submit validated values to backend API
      }}
      onChange={(_values) => {
        // Inspect live form updates if needed
      }}
    />
  );
}
