import { Platform } from 'react-native';
import { Button, Icon, Row, Text } from '@expo/ui';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { IconRenderOverride, PlatformIconDefinition } from '../types';

const BUILT_IN_ICONS: Record<string, PlatformIconDefinition> = {
  eye: { ios: 'eye' as SFSymbol, glyph: '👁', label: 'Show' },
  'eye-off': { ios: 'eye.slash' as SFSymbol, glyph: '🙈', label: 'Hide' },
  'eye.slash': { ios: 'eye.slash' as SFSymbol, glyph: '🙈', label: 'Hide' },
  visibility: { ios: 'eye' as SFSymbol, glyph: '👁', label: 'Show' },
  'visibility-off': { ios: 'eye.slash' as SFSymbol, glyph: '🙈', label: 'Hide' },
  search: { ios: 'magnifyingglass' as SFSymbol, glyph: '🔍', label: 'Search' },
  calendar: { ios: 'calendar' as SFSymbol, glyph: '📅', label: 'Calendar' },
  clock: { ios: 'clock' as SFSymbol, glyph: '🕒', label: 'Time' },
  'chevron-down': { ios: 'chevron.down' as SFSymbol, glyph: '▾', label: 'Expand' },
  'chevron-up': { ios: 'chevron.up' as SFSymbol, glyph: '▴', label: 'Collapse' },
  'chevron-left': { ios: 'chevron.left' as SFSymbol, glyph: '‹', label: 'Previous' },
  'chevron-right': { ios: 'chevron.right' as SFSymbol, glyph: '›', label: 'Next' },
  check: { ios: 'checkmark' as SFSymbol, glyph: '✓', label: 'Selected' },
  close: { ios: 'xmark' as SFSymbol, glyph: '✕', label: 'Clear' },
  clear: { ios: 'xmark.circle.fill' as SFSymbol, glyph: '✕', label: 'Clear' },
  upload: { ios: 'arrow.up.doc' as SFSymbol, glyph: '⬆', label: 'Upload' },
  camera: { ios: 'camera' as SFSymbol, glyph: '📷', label: 'Camera' },
  image: { ios: 'photo' as SFSymbol, glyph: '🖼', label: 'Gallery' },
  document: { ios: 'doc.text' as SFSymbol, glyph: '📄', label: 'Document' },
  file: { ios: 'paperclip' as SFSymbol, glyph: '📎', label: 'Attach' },
  trash: { ios: 'trash' as SFSymbol, glyph: '🗑', label: 'Remove' },
  delete: { ios: 'trash' as SFSymbol, glyph: '✕', label: 'Remove' },
  star: { ios: 'star.fill' as SFSymbol, glyph: '★', label: 'Star' },
  'star-fill': { ios: 'star.fill' as SFSymbol, glyph: '★', label: 'Star' },
  'star-outline': { ios: 'star' as SFSymbol, glyph: '☆', label: 'Unselected star' },
  location: { ios: 'location' as SFSymbol, glyph: '📍', label: 'Location' },
  lock: { ios: 'lock' as SFSymbol, glyph: '🔒', label: 'Secure' },
  unlock: { ios: 'lock.open' as SFSymbol, glyph: '🔓', label: 'Unlocked' },
  mail: { ios: 'envelope' as SFSymbol, glyph: '✉', label: 'Email' },
  email: { ios: 'envelope' as SFSymbol, glyph: '✉', label: 'Email' },
  phone: { ios: 'phone' as SFSymbol, glyph: '📞', label: 'Phone' },
  user: { ios: 'person' as SFSymbol, glyph: '👤', label: 'User' },
  organization: { ios: 'building.2' as SFSymbol, glyph: '🏢', label: 'Organization' },
  globe: { ios: 'globe' as SFSymbol, glyph: '🌐', label: 'Website' },
  link: { ios: 'link' as SFSymbol, glyph: '🔗', label: 'Link' },
  plus: { ios: 'plus' as SFSymbol, glyph: '+', label: 'Add' },
  minus: { ios: 'minus' as SFSymbol, glyph: '−', label: 'Decrease' },
  info: { ios: 'info.circle' as SFSymbol, glyph: 'ℹ', label: 'Info' },
  warning: { ios: 'exclamationmark.triangle' as SFSymbol, glyph: '⚠', label: 'Warning' },
  error: { ios: 'exclamationmark.circle' as SFSymbol, glyph: '!', label: 'Error' },
  refresh: { ios: 'arrow.clockwise' as SFSymbol, glyph: '↻', label: 'Retry' },
  edit: { ios: 'pencil' as SFSymbol, glyph: '✎', label: 'Edit' },
};

const customIconRegistry = new Map<string, PlatformIconDefinition>();

/**
 * Register a custom icon (such as an Android XML drawable asset or iOS SF Symbol)
 * for a logical icon name used in JSON form configs.
 */
export function registerFormIcon(name: string, definition: PlatformIconDefinition): void {
  customIconRegistry.set(name, definition);
}

export function resolveIconDefinition(name: string): PlatformIconDefinition {
  return (
    customIconRegistry.get(name) ??
    BUILT_IN_ICONS[name] ?? {
      ios: name as SFSymbol,
      glyph: '•',
      label: name,
    }
  );
}

export interface FormIconProps {
  name: string;
  size?: number;
  color?: string;
  accessibilityLabel?: string;
  testID?: string;
  renderOverride?: IconRenderOverride;
}

export function FormIcon({
  name,
  size = 20,
  color = '#475569',
  accessibilityLabel,
  testID,
  renderOverride,
}: FormIconProps) {
  if (renderOverride) {
    return renderOverride({
      name,
      size,
      color,
      accessibilityLabel,
      testID,
    });
  }

  const def = resolveIconDefinition(name);

  if (Platform.OS === 'ios' && def.ios) {
    return (
      <Icon
        name={def.ios}
        size={size}
        color={color}
        accessibilityLabel={accessibilityLabel ?? def.label}
        testID={testID}
      />
    );
  }

  if (Platform.OS === 'android' && def.android) {
    return (
      <Icon
        name={def.android}
        size={size}
        color={color}
        accessibilityLabel={accessibilityLabel ?? def.label}
        testID={testID}
      />
    );
  }

  // Universal native `@expo/ui` Text glyph fallback when running on Web or on Android without XML vector drawables
  return (
    <Text
      testID={testID}
      textStyle={{
        fontSize: Math.max(13, Math.round(size * 0.85)),
        color,
        textAlign: 'center',
      }}>
      {def.glyph ?? def.label ?? name}
    </Text>
  );
}

export interface NativeIconButtonProps {
  name: string;
  onPress: () => void;
  size?: number;
  color?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  renderOverride?: IconRenderOverride;
}

/**
 * Interactive native icon button built on `@expo/ui` Button + Icon.
 * Guarantees genuine native touch handling (SwiftUI Button on iOS, Compose Button on Android).
 */
export function NativeIconButton({
  name,
  onPress,
  size = 20,
  color = '#475569',
  disabled = false,
  accessibilityLabel,
  testID,
  renderOverride,
}: NativeIconButtonProps) {
  if (renderOverride) {
    return renderOverride({
      name,
      size,
      color,
      onPress,
      accessibilityLabel,
      disabled,
      testID,
    });
  }

  const def = resolveIconDefinition(name);

  return (
    <Button
      variant="text"
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={{
        height: 40,
        paddingHorizontal: 8,
        borderRadius: 8,
      }}>
      <Row alignment="center" spacing={4}>
        <FormIcon
          name={name}
          size={size}
          color={color}
          accessibilityLabel={accessibilityLabel ?? def.label}
        />
      </Row>
    </Button>
  );
}
