import React from 'react';

import { FormPageShell } from '@/components/FormPageShell';
import { kycWizardFormConfig } from '@/forms';

export default function KycWizardPage() {
  return (
    <FormPageShell
      config={kycWizardFormConfig}
      badgeText="MULTI-STEP KYC WIZARD"
      helperNote="Demonstrates per-step validation, computed bundle value, sliders, and signature."
      presets={[
        {
          label: 'Prefill Step 1',
          values: {
            contactMethod: 'merchant@store.pk',
            verificationOtp: '482910',
            documentType: 'passport',
          },
        },
      ]}
    />
  );
}
