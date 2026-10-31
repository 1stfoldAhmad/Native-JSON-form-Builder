import type { FormConfig } from '@/components/expo-form';

import checkoutJson from '../../forms/checkout.json';
import contactSupportJson from '../../forms/contact-support.json';
import feedbackSurveyJson from '../../forms/feedback-survey.json';
import forgotPasswordJson from '../../forms/forgot-password.json';
import jobApplicationJson from '../../forms/job-application.json';
import kycWizardJson from '../../forms/kyc-wizard.json';
import loginJson from '../../forms/login.json';
import registerJson from '../../forms/register.json';

export const registerFormConfig = registerJson as unknown as FormConfig;
export const loginFormConfig = loginJson as unknown as FormConfig;
export const forgotPasswordFormConfig = forgotPasswordJson as unknown as FormConfig;
export const checkoutFormConfig = checkoutJson as unknown as FormConfig;
export const jobApplicationFormConfig = jobApplicationJson as unknown as FormConfig;
export const contactSupportFormConfig = contactSupportJson as unknown as FormConfig;
export const kycWizardFormConfig = kycWizardJson as unknown as FormConfig;
export const feedbackSurveyFormConfig = feedbackSurveyJson as unknown as FormConfig;

export interface DemoFormEntry {
  slug: string;
  route:
    | '/register'
    | '/login'
    | '/forgot-password'
    | '/checkout'
    | '/job-application'
    | '/contact-support'
    | '/kyc-wizard'
    | '/feedback-survey';
  title: string;
  subtitle: string;
  badge: string;
  category: 'Authentication' | 'Commerce & Finance' | 'Business & Operations';
  iconName: string;
  highlights: readonly string[];
  config: FormConfig;
}

export const DEMO_FORMS: readonly DemoFormEntry[] = [
  {
    slug: 'register',
    route: '/register',
    title: 'Register (All 88 Field Types)',
    subtitle:
      'Complete registration & onboarding form exercising every built-in field type across all 7 categories.',
    badge: '88 Types',
    category: 'Authentication',
    iconName: 'person-add-outline',
    highlights: [
      'All 88 built-in field types',
      'Password toggle & strength meter',
      'AJV 2020-12 + async checks',
      'English & Urdu RTL i18n',
    ],
    config: registerFormConfig,
  },
  {
    slug: 'login',
    route: '/login',
    title: 'Login / Sign In',
    subtitle:
      'Multi-mode sign-in supporting Email & Password, Mobile SMS OTP, Quick PIN, and optional 2FA TOTP.',
    badge: '3 Modes',
    category: 'Authentication',
    iconName: 'log-in-outline',
    highlights: [
      'Password / OTP / PIN switch',
      'Conditional 2FA code input',
      'Native password visibility toggle',
    ],
    config: loginFormConfig,
  },
  {
    slug: 'forgot-password',
    route: '/forgot-password',
    title: 'Forgot Password Wizard',
    subtitle:
      '3-step account recovery flow: identity lookup, 6-digit OTP verification, and new password setup.',
    badge: '3 Steps',
    category: 'Authentication',
    iconName: 'key-outline',
    highlights: [
      'Per-step validation gating',
      'OTP verification step',
      'Confirm password match rule',
    ],
    config: forgotPasswordFormConfig,
  },
  {
    slug: 'checkout',
    route: '/checkout',
    title: 'E-Commerce Checkout',
    subtitle:
      'Shipping address, live computed order subtotal, custom promo code field, and conditional payment methods.',
    badge: 'Commerce',
    category: 'Commerce & Finance',
    iconName: 'cart-outline',
    highlights: [
      'Live computed subtotal',
      'Custom PromoCode field (EXPO58)',
      'Masked card & CVV inputs',
    ],
    config: checkoutFormConfig,
  },
  {
    slug: 'kyc-wizard',
    route: '/kyc-wizard',
    title: 'Merchant KYC Wizard',
    subtitle:
      'Multi-step merchant verification with document PDF upload, volume sliders, and signature capture.',
    badge: 'Wizard',
    category: 'Commerce & Finance',
    iconName: 'shield-checkmark-outline',
    highlights: [
      'PDF upload validation',
      'Range & volume sliders',
      'Electronic signature pad',
    ],
    config: kycWizardFormConfig,
  },
  {
    slug: 'job-application',
    route: '/job-application',
    title: 'Job Application',
    subtitle:
      'Candidate profile with repeatable work history, searchable tech stack, resume PDF, and signature.',
    badge: 'HR / Recruiting',
    category: 'Business & Operations',
    iconName: 'briefcase-outline',
    highlights: [
      'Repeatable work positions',
      'Searchable multi-select skills',
      'Resume PDF & signature',
    ],
    config: jobApplicationFormConfig,
  },
  {
    slug: 'contact-support',
    route: '/contact-support',
    title: 'Contact & Support Ticket',
    subtitle:
      'Customer helpdesk form with priority chips, screenshot uploads, and conditional callback scheduling.',
    badge: 'Support',
    category: 'Business & Operations',
    iconName: 'chatbubbles-outline',
    highlights: [
      'Severity chips & platform group',
      'Multi-image screenshot upload',
      'Conditional callback scheduler',
    ],
    config: contactSupportFormConfig,
  },
  {
    slug: 'feedback-survey',
    route: '/feedback-survey',
    title: 'Product Feedback Survey',
    subtitle:
      'Interactive star rating, Net Promoter Score slider, color picker, beta date window, and follow-up toggle.',
    badge: 'Survey',
    category: 'Business & Operations',
    iconName: 'star-outline',
    highlights: [
      '5-star rating & 0–10 NPS slider',
      'Color swatch & hex picker',
      'Date range availability',
    ],
    config: feedbackSurveyFormConfig,
  },
];
