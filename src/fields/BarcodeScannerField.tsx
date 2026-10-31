import { useRef, useState } from 'react';
import { Button, Column, Row, Text, TextInput } from '@expo/ui';

import { defaultCapabilityRegistry } from '../capabilities/PlatformCapabilityRegistry';
import { useActiveForm } from '../core/context';
import { FormIcon } from '../icons/IconRenderer';
import { useNativeTextState } from '../state/useNativeTextState';
import type { FieldRendererProps } from '../types';
import { resolveLocalizedText } from '../utils/formatting';
import { compileSafeRegex } from '../utils/regexSafety';

/**
 * Native `@expo/ui` Barcode & QR Code input field (`type: 'barcode' | 'qrCode'`).
 * Integrates with optional `BarcodeScannerAdapter` when registered in
 * `defaultCapabilityRegistry` and provides instant manual `@expo/ui` `TextInput`
 * entry fallback on devices/web without camera scanner hardware.
 */
export function BarcodeScannerFieldRenderer({
  field,
  fieldPath,
  disabled,
  readOnly,
  returnKeyType,
  styles,
  locale,
  onFocus,
  onBlur,
  onSubmitEditing,
  registerFocusHandle,
}: FieldRendererProps) {
  const { store, config, renderIcon } = useActiveForm();
  const [scanning, setScanning] = useState(false);
  const seenCodesRef = useRef<Set<string>>(new Set());

  const { nativeState, handleChangeText } = useNativeTextState({
    store,
    fieldPath,
    parseToStoreValue: (txt) => txt.trim(),
  });

  const scannerAdapter = defaultCapabilityRegistry.getBarcodeScannerAdapter();
  const placeholder =
    resolveLocalizedText(field.placeholder, locale, config.i18n?.translations) ??
    (field.type === 'qrCode' ? 'Scan or enter QR code...' : 'Scan or enter barcode...');

  const applyScannedValue = (rawCode: string, scannedFormat?: string) => {
    const allowedFormats = field.scan?.formats;
    if (
      allowedFormats &&
      allowedFormats.length > 0 &&
      scannedFormat &&
      !allowedFormats.map((f) => f.toLowerCase()).includes(scannedFormat.toLowerCase())
    ) {
      store.setError(
        fieldPath,
        `Unsupported code format "${scannedFormat}". Expected: ${allowedFormats.join(', ')}`
      );
      return;
    }

    let extracted = rawCode.trim();
    if (field.scan?.extractPattern) {
      const compiledRegex = compileSafeRegex(field.scan.extractPattern);
      if (compiledRegex) {
        const m = compiledRegex.exec(extracted);
        if (!m) {
          store.setError(fieldPath, 'Scanned code did not match expected format');
          return;
        }
        extracted = m[1] ?? m[0];
      }
    }

    if (field.scan?.preventDuplicates && seenCodesRef.current.has(extracted)) {
      store.setError(fieldPath, `Duplicate code "${extracted}" has already been scanned`);
      return;
    }

    seenCodesRef.current.add(extracted);
    store.clearErrors(fieldPath);
    store.setValue(fieldPath, extracted, { shouldDirty: true, shouldTouch: true });
  };

  const handleScanPress = async () => {
    if (!scannerAdapter || disabled || readOnly || scanning) return;
    setScanning(true);
    try {
      const formats =
        field.scan?.formats ?? (field.type === 'qrCode' ? ['qr'] : undefined);
      const scanned = await scannerAdapter.scanCode({ formats });
      if (scanned?.data) {
        applyScannedValue(scanned.data, scanned.format);
      }
    } catch (err) {
      store.setError(
        fieldPath,
        err instanceof Error ? err.message : 'Camera barcode scan failed'
      );
    } finally {
      setScanning(false);
    }
  };

  return (
    <Column spacing={8} style={{ width: '100%' }}>
      <Row spacing={8} alignment="center" style={{ width: '100%' }}>
        <TextInput
          ref={(instance) => {
            registerFocusHandle(
              instance
                ? {
                    focus: () => instance.focus(),
                    blur: () => instance.blur(),
                  }
                : null
            );
          }}
          value={nativeState}
          placeholder={placeholder}
          placeholderTextColor={styles.placeholderColor}
          editable={!disabled && !readOnly}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType={returnKeyType}
          style={{
            ...styles.inputStyle,
            width: scannerAdapter && !readOnly ? '72%' : '100%',
          }}
          textStyle={styles.inputTextStyle}
          testID={`barcode-input-${fieldPath}`}
          onChangeText={handleChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
        />

        {scannerAdapter && !readOnly ? (
          <Button
            variant="outlined"
            disabled={disabled || scanning}
            testID={`barcode-scan-btn-${fieldPath}`}
            onPress={() => {
              void handleScanPress();
            }}
            style={{
              height: styles.inputStyle.height ?? 48,
              borderRadius: styles.inputStyle.borderRadius ?? 10,
            }}>
            <Row spacing={6} alignment="center">
              <FormIcon
                name="camera"
                size={16}
                color={styles.tintColor}
                renderOverride={renderIcon}
              />
              <Text textStyle={{ ...styles.inputTextStyle, fontWeight: '600' }}>
                {scanning ? 'Scanning...' : 'Scan'}
              </Text>
            </Row>
          </Button>
        ) : null}
      </Row>
    </Column>
  );
}
