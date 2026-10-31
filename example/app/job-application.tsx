import React from 'react';

import { FormPageShell } from '@/components/FormPageShell';
import { jobApplicationFormConfig } from '@/forms';

export default function JobApplicationPage() {
  return (
    <FormPageShell
      config={jobApplicationFormConfig}
      badgeText="JOB APPLICATION"
      helperNote="Repeatable work history, searchable tech stack, resume PDF upload, and signature."
      presets={[
        {
          label: 'Prefill Candidate',
          values: {
            firstName: 'Ahmad',
            lastName: 'Khan',
            email: 'ahmad@1stfold.com',
            phone: '+923001234567',
            linkedinUrl: 'https://linkedin.com/in/ahmadkhan',
            portfolioWebsite: 'https://github.com/1stfoldAhmad',
            roleApplied: 'senior-rn',
            workArrangement: ['remote', 'hybrid'],
            skills: ['typescript', 'expo', 'rn', 'swiftui', 'compose'],
            yearsExperience: 6,
            expectedSalaryUsd: 120000,
            earliestStartDate: '2026-11-15',
            coverLetter:
              'Built a native JSON Schema 2020-12 form engine across SwiftUI, Jetpack Compose, and Expo Web.',
            requiresSponsorship: 'no',
            applicantSignature: 'Signed by Ahmad Khan',
          },
        },
      ]}
    />
  );
}
