import { useMemo, useState } from 'react';
import {
  BottomSheet,
  Button,
  Column,
  Row,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';

import { useActiveForm } from '../core/context';
import { FormIcon, NativeIconButton } from '../icons/IconRenderer';
import type { FieldRendererProps, FormFileAsset } from '../types';
import {
  pickFromCameraOrGallery,
  pickFromDocumentSystem,
  resolveUploadConstraints,
  validateSelectedFiles,
} from '../uploads/UploadAdapter';
import { formatFileSize } from '../utils/formatting';

/**
 * Unified native renderer for all 11 Category F File & Media Upload fields:
 * `image`, `camera`, `avatar`, `video`, `audio`, `document`, `pdf`, `file`,
 * `multipleFiles`, `multipleImages`, and `signature`.
 *
 * Uses `@expo/ui` buttons to trigger system-native `expo-image-picker` and `expo-document-picker`
 * interfaces, displaying previews, file metadata, upload progress, error/retry, and removal controls.
 */
export function FileUploadFieldRenderer(props: FieldRendererProps) {
  if (props.field.type === 'signature') {
    return <SignatureFieldRenderer {...props} />;
  }
  return <StandardUploadFieldRenderer {...props} />;
}

function StandardUploadFieldRenderer({
  field,
  fieldPath,
  value,
  disabled,
  readOnly,
  files: filesProp,
  styles,
}: FieldRendererProps) {
  const { store, actions, renderIcon } = useActiveForm();
  const [busy, setBusy] = useState(false);

  const constraints = useMemo(
    () => resolveUploadConstraints(field.type, field.upload),
    [field.type, field.upload]
  );

  const currentFiles: FormFileAsset[] = useMemo(() => {
    if (filesProp && filesProp.length > 0) return filesProp;
    if (Array.isArray(value)) return value as FormFileAsset[];
    if (value && typeof value === 'object' && 'uri' in value) {
      return [value as FormFileAsset];
    }
    return [];
  }, [filesProp, value]);

  const runUploadActionIfConfigured = async (assets: FormFileAsset[]) => {
    const uploadActionId = field.upload?.uploadActionId;
    if (!uploadActionId || !actions[uploadActionId]) return;

    const uploadingList = assets.map((a) => ({
      ...a,
      status: 'uploading' as const,
      progress: 35,
    }));
    store.setFieldFiles(fieldPath, uploadingList, constraints.multiple);

    try {
      await actions[uploadActionId]({
        actionId: uploadActionId,
        values: store.getValues(),
        params: { field: fieldPath, files: uploadingList },
        setValue: (p, v) => store.setValue(p, v),
        setError: (p, m) => store.setError(p, m),
      });

      const uploadedList = uploadingList.map((a) => ({
        ...a,
        status: 'uploaded' as const,
        progress: 100,
      }));
      store.setFieldFiles(fieldPath, uploadedList, constraints.multiple);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      const failedList = uploadingList.map((a) => ({
        ...a,
        status: 'error' as const,
        errorMessage: msg,
      }));
      store.setFieldFiles(fieldPath, failedList, constraints.multiple);
      store.setError(fieldPath, msg);
    }
  };

  const handleSelectFromSource = async (source: 'camera' | 'gallery' | 'files') => {
    if (disabled || readOnly || busy) return;
    setBusy(true);

    try {
      const picked =
        source === 'camera' || source === 'gallery'
          ? await pickFromCameraOrGallery(source, field.type, constraints)
          : await pickFromDocumentSystem(constraints);

      if (picked.length === 0) return;

      const existingCount = constraints.multiple ? currentFiles.length : 0;
      const { accepted, errors } = validateSelectedFiles(picked, existingCount, constraints);

      if (errors.length > 0) {
        store.setError(fieldPath, errors[0]);
      } else {
        store.clearErrors(fieldPath);
      }

      if (accepted.length > 0) {
        const merged = constraints.multiple ? [...currentFiles, ...accepted] : [accepted[0]];
        store.setFieldFiles(fieldPath, merged, constraints.multiple);
        await runUploadActionIfConfigured(merged);
      }
    } catch (err) {
      store.setError(
        fieldPath,
        err instanceof Error ? err.message : 'Unable to select file'
      );
    } finally {
      setBusy(false);
    }
  };

  const removeFile = (id: string) => {
    const remaining = currentFiles.filter((f) => f.id !== id);
    store.setFieldFiles(fieldPath, remaining, constraints.multiple);
  };

  const canAddMore = !constraints.multiple || currentFiles.length < constraints.maxFiles;

  const primaryLabel =
    field.upload?.buttonLabel ??
    (field.type === 'avatar'
      ? 'Choose Profile Photo'
      : field.type === 'camera'
        ? 'Take Photo'
        : field.type === 'pdf'
          ? 'Select PDF'
          : field.type === 'document'
            ? 'Select Document'
            : constraints.multiple
              ? 'Select Files'
              : 'Choose File');

  return (
    <Column spacing={10} style={{ width: '100%' }}>
      {!readOnly && canAddMore ? (
        <Row spacing={8} alignment="center" style={{ width: '100%' }}>
          {constraints.sources.includes('camera') ? (
            <Button
              variant={constraints.sources.length === 1 ? 'filled' : 'outlined'}
              disabled={disabled || busy}
              testID={`upload-camera-${fieldPath}`}
              onPress={() => void handleSelectFromSource('camera')}
              style={{ height: 44, borderRadius: 10, paddingHorizontal: 14 }}>
              <Row spacing={6} alignment="center">
                <FormIcon
                  name="camera"
                  size={18}
                  color={
                    constraints.sources.length === 1 ? '#FFFFFF' : styles.iconColor
                  }
                  renderOverride={renderIcon}
                />
                <Text
                  textStyle={{
                    fontSize: 14,
                    fontWeight: '600',
                    color:
                      constraints.sources.length === 1
                        ? '#FFFFFF'
                        : (styles.inputTextStyle.color ?? '#0F172A'),
                  }}>
                  {field.upload?.cameraButtonLabel ?? 'Camera'}
                </Text>
              </Row>
            </Button>
          ) : null}

          {constraints.sources.includes('gallery') ? (
            <Button
              variant="outlined"
              disabled={disabled || busy}
              testID={`upload-gallery-${fieldPath}`}
              onPress={() => void handleSelectFromSource('gallery')}
              style={{ height: 44, borderRadius: 10, paddingHorizontal: 14 }}>
              <Row spacing={6} alignment="center">
                <FormIcon name="image" size={18} color={styles.iconColor} renderOverride={renderIcon} />
                <Text textStyle={{ ...styles.inputTextStyle, fontWeight: '600' }}>
                  {primaryLabel}
                </Text>
              </Row>
            </Button>
          ) : null}

          {constraints.sources.includes('files') ? (
            <Button
              variant="outlined"
              disabled={disabled || busy}
              testID={`upload-files-${fieldPath}`}
              onPress={() => void handleSelectFromSource('files')}
              style={{ height: 44, borderRadius: 10, paddingHorizontal: 14 }}>
              <Row spacing={6} alignment="center">
                <FormIcon
                  name={field.type === 'pdf' || field.type === 'document' ? 'document' : 'upload'}
                  size={18}
                  color={styles.iconColor}
                  renderOverride={renderIcon}
                />
                <Text textStyle={{ ...styles.inputTextStyle, fontWeight: '600' }}>
                  {busy ? 'Selecting...' : primaryLabel}
                </Text>
              </Row>
            </Button>
          ) : null}
        </Row>
      ) : null}

      {currentFiles.length > 0 ? (
        <Column spacing={8} style={{ width: '100%' }} testID={`upload-list-${fieldPath}`}>
          {currentFiles.map((asset) => (
            <Row
              key={asset.id}
              alignment="center"
              spacing={10}
              style={{
                width: '100%',
                padding: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor:
                  asset.status === 'error'
                    ? '#DC2626'
                    : (styles.inputStyle.borderColor ?? '#CBD5E1'),
                backgroundColor: styles.inputStyle.backgroundColor ?? '#F8FAFC',
              }}>
              <FormIcon
                name={asset.mimeType.startsWith('image/') ? 'image' : 'document'}
                size={20}
                color={styles.tintColor}
                renderOverride={renderIcon}
              />
              <Column spacing={2} style={{ width: '68%' }}>
                <Text
                  numberOfLines={1}
                  textStyle={{
                    ...styles.inputTextStyle,
                    fontSize: 14,
                    fontWeight: '500',
                  }}>
                  {asset.name}
                </Text>
                <Text textStyle={styles.descriptionStyle}>
                  {`${asset.size > 0 ? formatFileSize(asset.size) : 'Selected'} · ${asset.mimeType}${
                    asset.status === 'uploading'
                      ? ` · Uploading ${asset.progress ?? 0}%`
                      : asset.status === 'uploaded'
                        ? ' · Uploaded'
                        : asset.status === 'error'
                          ? ` · ${asset.errorMessage ?? 'Failed'}`
                          : ''
                  }`}
                </Text>
              </Column>
              <Spacer flexible />

              {asset.status === 'error' && !disabled && !readOnly ? (
                <NativeIconButton
                  name="refresh"
                  size={18}
                  color={styles.tintColor}
                  accessibilityLabel="Retry upload"
                  testID={`upload-retry-${fieldPath}-${asset.id}`}
                  onPress={() => void runUploadActionIfConfigured(currentFiles)}
                  renderOverride={renderIcon}
                />
              ) : null}

              {!disabled && !readOnly ? (
                <NativeIconButton
                  name="trash"
                  size={18}
                  color="#DC2626"
                  accessibilityLabel={`Remove ${asset.name}`}
                  testID={`upload-remove-${fieldPath}-${asset.id}`}
                  onPress={() => removeFile(asset.id)}
                  renderOverride={renderIcon}
                />
              ) : null}
            </Row>
          ))}
        </Column>
      ) : null}
    </Column>
  );
}

function SignatureFieldRenderer({
  field,
  fieldPath,
  value,
  disabled,
  readOnly,
  styles,
}: FieldRendererProps) {
  const { store, renderIcon } = useActiveForm();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sigNameState = useNativeState<string>('');
  const [sigText, setSigText] = useState('');

  const asset =
    value && typeof value === 'object' && 'uri' in value
      ? (value as FormFileAsset)
      : null;

  const confirmSignature = () => {
    const trimmed = sigText.trim();
    if (!trimmed) return;
    const encoded = encodeURIComponent(trimmed);
    const sigAsset: FormFileAsset = {
      id: `sig_${Date.now()}`,
      name: `signature-${trimmed.replace(/\s+/g, '-').toLowerCase()}.svg`,
      uri: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80"><text x="16" y="52" font-size="28" font-style="italic">${encoded}</text></svg>`,
      mimeType: 'image/svg+xml',
      size: trimmed.length * 16,
      source: 'signature',
      status: 'selected',
    };
    store.setFieldFiles(fieldPath, [sigAsset], false);
    setSheetOpen(false);
  };

  return (
    <Column spacing={8} style={{ width: '100%' }}>
      {asset ? (
        <Row
          alignment="center"
          spacing={10}
          style={{
            ...styles.inputStyle,
            height: 56,
          }}>
          <FormIcon name="edit" size={18} color={styles.tintColor} renderOverride={renderIcon} />
          <Text
            textStyle={{
              ...styles.inputTextStyle,
              fontSize: 18,
              fontWeight: '600',
            }}>
            {`Signed: ${asset.name.replace(/^signature-|\.svg$/g, '')}`}
          </Text>
          <Spacer flexible />
          {!disabled && !readOnly ? (
            <NativeIconButton
              name="trash"
              size={18}
              color="#DC2626"
              accessibilityLabel="Clear signature"
              testID={`signature-clear-${fieldPath}`}
              onPress={() => store.setFieldFiles(fieldPath, [], false)}
              renderOverride={renderIcon}
            />
          ) : null}
        </Row>
      ) : (
        <Button
          variant="outlined"
          disabled={disabled || readOnly}
          testID={field.testID ?? `signature-open-${fieldPath}`}
          onPress={() => setSheetOpen(true)}
          style={{ ...styles.inputStyle, height: 52 }}>
          <Row spacing={8} alignment="center">
            <FormIcon name="edit" size={18} color={styles.iconColor} renderOverride={renderIcon} />
            <Text textStyle={styles.inputTextStyle}>
              {field.upload?.buttonLabel ?? 'Tap to Sign'}
            </Text>
          </Row>
        </Button>
      )}

      <BottomSheet
        isPresented={sheetOpen}
        onDismiss={() => setSheetOpen(false)}
        snapPoints={['half']}>
        <Column spacing={14} style={{ width: '100%', paddingBottom: 24 }}>
          <Text textStyle={{ fontSize: 17, fontWeight: '700', color: styles.labelStyle.color }}>
            Adopt Electronic Signature
          </Text>
          <Text textStyle={styles.descriptionStyle}>
            Enter your full legal name below to generate and attach your signature.
          </Text>
          <TextInput
            value={sigNameState}
            placeholder="Full legal name"
            placeholderTextColor={styles.placeholderColor}
            style={styles.inputStyle}
            textStyle={{ ...styles.inputTextStyle, fontSize: 18 }}
            testID={`signature-input-${fieldPath}`}
            onChangeText={setSigText}
          />
          <Row spacing={10} alignment="center">
            <Button
              variant="outlined"
              label="Cancel"
              onPress={() => setSheetOpen(false)}
            />
            <Button
              variant="filled"
              label="Sign & Attach"
              disabled={!sigText.trim()}
              testID={`signature-confirm-${fieldPath}`}
              onPress={confirmSignature}
            />
          </Row>
        </Column>
      </BottomSheet>
    </Column>
  );
}
