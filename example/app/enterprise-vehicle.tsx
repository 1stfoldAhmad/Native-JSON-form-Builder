import React from 'react';

import { FormPageShell } from '@/components/FormPageShell';
import { vehicleRegistrationEnterpriseConfig } from '@/forms';

export default function EnterpriseVehiclePage() {
  return (
    <FormPageShell
      config={vehicleRegistrationEnterpriseConfig}
      badgeText="ENTERPRISE WORKFLOW & FORMULA ENGINE"
      helperNote="Showcases FormulaEngine (SUM, ROUND, IF), conditional step skipWhen, reorderable repeater, QR/document scanner fallbacks, GPS coordinates, and finance-enterprise theme."
      presets={[
        {
          label: 'Prefill Imported 2500cc Fleet',
          values: {
            chassisCode: 'PK-99887766',
            originType: 'imported',
            usageCategory: 'commercial',
            engineCc: 2500,
            ownerTaxPin: '4921',
            gdNumber: 'KHI-GD-2026-88412',
            invoicePrice: 9200000,
          },
        },
      ]}
    />
  );
}
