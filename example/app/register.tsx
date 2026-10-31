import React from 'react';

import { FormPageShell } from '@/components/FormPageShell';
import { registerFormConfig } from '@/forms';

export default function RegisterFormPage() {
  return (
    <FormPageShell
      config={registerFormConfig}
      badgeText="ALL 88 FIELD TYPES • 7 CATEGORIES"
      helperNote="Switch Personal ↔ Business or tap Prefill to test instant valid submission."
      presets={[
        {
          label: 'Prefill Personal',
          values: {
            accountType: 'personal',
            firstName: 'Ahmad',
            middleName: 'Ali',
            lastName: 'Khan',
            legalFullName: 'Ahmad Ali Khan',
            nickname: 'Ahmad K.',
            username: 'ahmad.khan',
            email: 'ahmad@1stfold.com',
            recoveryContact: '+923211234567',
            country: 'PK',
            state: 'Punjab',
            city: 'Rawalpindi',
            phone: '+923001234567',
            cnic: '35202-1234567-1',
            birthday: '1998-05-15',
            password: 'Str0ng!Password99',
            confirmPassword: 'Str0ng!Password99',
            acceptTerms: true,
          },
        },
        {
          label: 'Prefill Business',
          values: {
            accountType: 'business',
            firstName: 'Zainab',
            lastName: 'Malik',
            organization: '1stFold Technologies Pvt. Ltd.',
            jobTitle: 'VP of Engineering',
            website: 'https://1stfold.com',
            username: 'zainab.malik',
            email: 'zainab@1stfold.com',
            country: 'PK',
            state: 'Islamabad',
            city: 'Islamabad',
            phone: '+923019876543',
            cnic: '61101-7654321-2',
            birthday: '1995-11-20',
            password: 'Str0ng!Password99',
            confirmPassword: 'Str0ng!Password99',
            acceptTerms: true,
          },
        },
      ]}
    />
  );
}
