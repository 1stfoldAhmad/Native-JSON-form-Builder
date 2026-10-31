import React from 'react';

import { FormPageShell } from '@/components/FormPageShell';
import { forgotPasswordFormConfig } from '@/forms';

export default function ForgotPasswordPage() {
  return (
    <FormPageShell
      config={forgotPasswordFormConfig}
      badgeText="3-STEP RECOVERY WIZARD"
      helperNote="Step validation ensures identity & OTP are verified before setting a new password."
      presets={[
        {
          label: 'Prefill Recovery',
          values: {
            accountIdentifier: 'ahmad@1stfold.com',
            channel: 'email',
            recoveryOtp: '839201',
            newPassword: 'N3w$ecurePassword!26',
            confirmNewPassword: 'N3w$ecurePassword!26',
            revokeOtherSessions: true,
          },
        },
      ]}
    />
  );
}
