import React from 'react';

import { FormPageShell } from '@/components/FormPageShell';
import { checkoutFormConfig } from '@/forms';

export default function CheckoutFormPage() {
  return (
    <FormPageShell
      config={checkoutFormConfig}
      badgeText="E-COMMERCE CHECKOUT"
      helperNote="Try promo code EXPO58 and toggle Card / Mobile Wallet / Cash on Delivery."
      presets={[
        {
          label: 'Prefill Card Order',
          values: {
            customerName: 'Ahmad Khan',
            customerEmail: 'ahmad@1stfold.com',
            customerPhone: '+923001234567',
            country: 'PK',
            state: 'Punjab',
            city: 'Rawalpindi',
            addressLine1: 'House 14, Street 8, Satellite Town',
            postalCode: '46000',
            shippingMethod: 'express',
            itemQty: 3,
            itemUnitPrice: 49.5,
            promoCode: 'EXPO58',
            paymentMethod: 'card',
            cardholderName: 'AHMAD KHAN',
            cardNumber: '4242 4242 4242 4242',
            cardExpiry: '08/29',
            cardCvv: '742',
            sameAsShipping: true,
          },
        },
      ]}
    />
  );
}
