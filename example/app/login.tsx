import React from 'react';

import { FormPageShell } from '@/components/FormPageShell';
import { loginFormConfig } from '@/forms';

export default function LoginFormPage() {
  return (
    <FormPageShell
      config={loginFormConfig}
      badgeText="SIGN IN • PASSWORD / OTP / PIN"
      helperNote="Switch between Password, Phone OTP, and Quick PIN modes."
      presets={[
        {
          label: 'Demo Password Login',
          values: {
            loginMethod: 'password',
            identifier: 'ahmad@1stfold.com',
            password: 'Str0ng!Password99',
            useAuthenticator2FA: false,
            rememberDevice: true,
          },
        },
        {
          label: 'Demo OTP Login',
          values: {
            loginMethod: 'otp',
            phone: '+923001234567',
            smsOtp: '482910',
            rememberDevice: true,
          },
        },
      ]}
    />
  );
}
