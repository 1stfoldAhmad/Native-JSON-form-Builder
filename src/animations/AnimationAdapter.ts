import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { getPlatformAnimationModifiers } from '../core/nativePlatformBridge';
import type {
  AnimationItemConfig,
  AnimationTriggerName,
  FormAnimationsConfig,
} from '../types';

export interface ResolveAnimationOptions {
  fieldAnimations?:
    | boolean
    | Partial<Record<AnimationTriggerName | 'enter' | 'exit' | 'reveal', AnimationItemConfig>>;
  reducedMotion?: boolean;
  isTyping?: boolean;
}

const DEFAULT_TRIGGER_PRESETS: Record<AnimationTriggerName, AnimationItemConfig> = {
  formEnter: { enabled: true, type: 'fade', duration: 240 },
  fieldEnter: { enabled: true, type: 'fade', duration: 200 },
  fieldExit: { enabled: true, type: 'fade', duration: 180 },
  fieldReveal: { enabled: true, type: 'spring', duration: 300, damping: 0.82 },
  focus: { enabled: true, type: 'easeInOut', duration: 160 },
  error: { enabled: true, type: 'fade', duration: 180 },
  success: { enabled: true, type: 'easeInOut', duration: 200 },
  loading: { enabled: true, type: 'fade', duration: 180 },
  submit: { enabled: true, type: 'spring', duration: 260, damping: 0.85 },
  scrollToError: { enabled: true, type: 'easeInOut', duration: 300 },
  stepTransition: { enabled: true, type: 'spring', duration: 280, damping: 0.84 },
  visibilityToggle: { enabled: true, type: 'easeInOut', duration: 150 },
};

/**
 * Tracks OS-level reduced-motion preference on iOS, Android, and Web.
 */
export function useReducedMotion(respectReducedMotion = true): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (!respectReducedMotion) {
      setReduceMotion(false);
      return;
    }

    let mounted = true;
    AccessibilityInfo?.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {
        // Ignore on unsupported hosts
      });

    const subscription = AccessibilityInfo?.addEventListener?.(
      'reduceMotionChanged',
      (enabled: boolean) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      }
    );

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, [respectReducedMotion]);

  return reduceMotion;
}

/**
 * Resolves the effective `AnimationItemConfig` for a given lifecycle trigger,
 * honoring global `enabled`, OS reduced-motion, typing suppression, and field overrides.
 */
export function resolveAnimationTrigger(
  formAnimations: FormAnimationsConfig | undefined,
  trigger: AnimationTriggerName,
  options?: ResolveAnimationOptions
): AnimationItemConfig | null {
  if (formAnimations?.enabled === false) return null;

  const respectRM = formAnimations?.respectReducedMotion ?? true;
  if (respectRM && options?.reducedMotion) return null;

  const suppressTyping = formAnimations?.suppressDuringTyping ?? true;
  if (suppressTyping && options?.isTyping && trigger !== 'visibilityToggle') {
    return null;
  }

  if (options?.fieldAnimations === false) {
    return null;
  }

  const fieldAnimObj =
    typeof options?.fieldAnimations === 'object' && options.fieldAnimations !== null
      ? options.fieldAnimations
      : undefined;
  const aliasKey =
    trigger === 'fieldEnter'
      ? 'enter'
      : trigger === 'fieldExit'
        ? 'exit'
        : trigger === 'fieldReveal'
          ? 'reveal'
          : undefined;
  const fieldItem =
    fieldAnimObj?.[trigger] ?? (aliasKey ? fieldAnimObj?.[aliasKey] : undefined);
  const formItem = formAnimations?.[trigger];
  const merged: AnimationItemConfig = {
    ...DEFAULT_TRIGGER_PRESETS[trigger],
    ...formItem,
    ...fieldItem,
  };

  if (merged.enabled === false || merged.type === 'none') {
    return null;
  }

  return merged;
}

/**
 * Translates a resolved logical `AnimationItemConfig` into `@expo/ui` platform modifiers
 * (SwiftUI `animation` on iOS, Jetpack Compose `animateContentSize` / `graphicsLayer` on Android,
 * `[]` on Web).
 */
export function buildNativeAnimationModifiers(
  animConfig: AnimationItemConfig | null,
  animatedValue: number | boolean,
  options?: { preventLayoutJumps?: boolean }
): any[] {
  return getPlatformAnimationModifiers(
    animConfig,
    animatedValue,
    options?.preventLayoutJumps ?? true
  );
}
