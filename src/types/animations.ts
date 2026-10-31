/**
 * Logical animation vocabulary supported across iOS (SwiftUI) and Android (Jetpack Compose).
 * No platform-specific modifier functions are embedded in JSON.
 */
export type AnimationType =
  | 'none'
  | 'fade'
  | 'slide'
  | 'slideUp'
  | 'slideDown'
  | 'scale'
  | 'spring'
  | 'smooth'
  | 'snappy'
  | 'bouncy'
  | 'shake'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'linear'
  | (string & {});

export type EasingPreset =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'spring'
  | (string & {});

export interface AnimationItemConfig {
  /** Whether this specific animation trigger is enabled. Defaults to true when defined. */
  enabled?: boolean;
  /** Logical animation preset. */
  type?: AnimationType;
  /** Duration in milliseconds (e.g. 250). Automatically converted to seconds for SwiftUI where needed. */
  duration?: number;
  /** Delay before starting in milliseconds. */
  delay?: number;
  /** Timing curve or spring preset. */
  easing?: EasingPreset;
  /** Spring damping fraction (0-1) for spring animations. */
  damping?: number;
  /** Spring stiffness for spring animations. */
  stiffness?: number;
  /** Extra bounce (0-0.9) for spring presets. */
  bounce?: number;
  /** Slide offset distance in dp/pt when using slide animations. */
  offset?: number;
  /** Initial scale factor (0-1) when using scale animations. */
  initialScale?: number;
}

/**
 * Complete form animation configuration covering all 12 lifecycle triggers.
 */
export interface FormAnimationsConfig {
  /** Global toggle for all form animations. Defaults to true. */
  enabled?: boolean;
  /** Respect OS reduced-motion accessibility setting. Defaults to true. */
  respectReducedMotion?: boolean;
  /** Prevent layout jumps when errors appear or conditional fields expand. Defaults to true. */
  preventLayoutJumps?: boolean;
  /** Suppress animations while rapidly typing. Defaults to true. */
  suppressDuringTyping?: boolean;

  /** Form entrance animation. */
  formEnter?: AnimationItemConfig;
  /** Individual field entrance animation. */
  fieldEnter?: AnimationItemConfig;
  /** Field exit/removal animation. */
  fieldExit?: AnimationItemConfig;
  /** Conditional field appearance animation. */
  fieldReveal?: AnimationItemConfig;
  /** Field focus state transition. */
  focus?: AnimationItemConfig;
  /** Validation error message appearance. */
  error?: AnimationItemConfig;
  /** Successful field/form validation transition. */
  success?: AnimationItemConfig;
  /** Submission loading transition. */
  loading?: AnimationItemConfig;
  /** Submission completion feedback. */
  submit?: AnimationItemConfig;
  /** Smooth scroll animation when jumping to the first invalid field. */
  scrollToError?: AnimationItemConfig;
  /** Multi-step wizard transition between steps. */
  stepTransition?: AnimationItemConfig;
  /** Password visibility toggle icon/field transition. */
  visibilityToggle?: AnimationItemConfig;
}

export type AnimationTriggerName =
  | 'formEnter'
  | 'fieldEnter'
  | 'fieldExit'
  | 'fieldReveal'
  | 'focus'
  | 'error'
  | 'success'
  | 'loading'
  | 'submit'
  | 'scrollToError'
  | 'stepTransition'
  | 'visibilityToggle';
