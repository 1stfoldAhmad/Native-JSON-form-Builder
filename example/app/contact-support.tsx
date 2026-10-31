import React from 'react';

import { FormPageShell } from '@/components/FormPageShell';
import { contactSupportFormConfig } from '@/forms';

export default function ContactSupportPage() {
  return (
    <FormPageShell
      config={contactSupportFormConfig}
      badgeText="SUPPORT HELPDESK"
      helperNote="Toggle callback scheduling to reveal conditional phone, date-time, and timezone inputs."
      presets={[
        {
          label: 'Prefill Bug Ticket',
          values: {
            fullName: 'Ahmad Khan',
            email: 'ahmad@1stfold.com',
            category: 'technical',
            priority: 'high',
            affectedPlatforms: ['ios', 'android'],
            subject: 'Keyboard inset padding in custom bottom sheet',
            description:
              'Verified keyboard avoidance behavior on Android 16 and iOS 19; requesting enterprise SLA guidance.',
            requestCallback: true,
            callbackPhone: '+923001234567',
            callbackDateTime: '2026-11-05T15:00',
            timezone: 'Asia/Karachi',
          },
        },
      ]}
    />
  );
}
