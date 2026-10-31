import React from 'react';

import { FormPageShell } from '@/components/FormPageShell';
import { feedbackSurveyFormConfig } from '@/forms';

export default function FeedbackSurveyPage() {
  return (
    <FormPageShell
      config={feedbackSurveyFormConfig}
      badgeText="PRODUCT SURVEY"
      helperNote="Interactive star rating, NPS slider, color swatch picker, and conditional follow-up email."
      presets={[
        {
          label: 'Prefill 5-Star Feedback',
          values: {
            overallRating: 5,
            npsScore: 10,
            usageFrequency: 'daily',
            favoriteFeatures: ['json-schema', 'native-ui', 'conditions', 'i18n', 'wizards'],
            preferredAccentColor: '#16A34A',
            improvements: 'Love the declarative JSON config + Drawer showcase!',
            allowFollowUp: true,
            followUpEmail: 'ahmad@1stfold.com',
          },
        },
      ]}
    />
  );
}
