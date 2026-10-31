import { Platform } from 'react-native';

import type {
  FieldConfig,
  FieldType,
  FileUploadConfig,
  FormConfig,
  FormFileAsset,
} from '../types';
import { formatFileSize } from '../utils/formatting';

export interface ResolvedUploadConstraints {
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxFileSize?: number;
  minFileSize?: number;
  maxFiles: number;
  multiple: boolean;
  sources: ('camera' | 'gallery' | 'files')[];
  imageQuality: number;
  allowsEditing: boolean;
  aspect?: readonly [number, number];
}

export function resolveUploadConstraints(
  fieldType: FieldType,
  upload?: FileUploadConfig
): ResolvedUploadConstraints {
  const multipleByDefault =
    fieldType === 'multipleFiles' || fieldType === 'multipleImages';

  const multiple = upload?.multiple ?? multipleByDefault;
  const maxFiles = upload?.maxFiles ?? (multiple ? 10 : 1);

  let defaultMimes: string[] = ['*/*'];
  let defaultExts: string[] = [];
  let defaultSources: ('camera' | 'gallery' | 'files')[] = ['files'];

  switch (fieldType) {
    case 'image':
    case 'multipleImages':
      defaultMimes = ['image/*'];
      defaultExts = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
      defaultSources = ['gallery', 'files'];
      break;
    case 'camera':
      defaultMimes = ['image/*'];
      defaultExts = ['.jpg', '.jpeg', '.png', '.heic'];
      defaultSources = ['camera'];
      break;
    case 'avatar':
      defaultMimes = ['image/jpeg', 'image/png', 'image/webp'];
      defaultExts = ['.jpg', '.jpeg', '.png', '.webp'];
      defaultSources = ['camera', 'gallery'];
      break;
    case 'video':
      defaultMimes = ['video/*'];
      defaultExts = ['.mp4', '.mov', '.webm', '.mkv'];
      defaultSources = ['gallery', 'files'];
      break;
    case 'audio':
      defaultMimes = ['audio/*'];
      defaultExts = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'];
      defaultSources = ['files'];
      break;
    case 'pdf':
      defaultMimes = ['application/pdf'];
      defaultExts = ['.pdf'];
      defaultSources = ['files'];
      break;
    case 'document':
      defaultMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ];
      defaultExts = ['.pdf', '.doc', '.docx', '.txt'];
      defaultSources = ['files'];
      break;
    default:
      defaultMimes = ['*/*'];
      defaultSources = ['files'];
      break;
  }

  return {
    allowedMimeTypes: upload?.allowedMimeTypes
      ? [...upload.allowedMimeTypes]
      : defaultMimes,
    allowedExtensions: upload?.allowedExtensions
      ? upload.allowedExtensions.map((e) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))
      : defaultExts,
    maxFileSize: upload?.maxFileSize,
    minFileSize: upload?.minFileSize,
    maxFiles,
    multiple,
    sources: upload?.sources
      ? (upload.sources as ('camera' | 'gallery' | 'files')[])
      : defaultSources,
    imageQuality: upload?.imageQuality ?? 0.85,
    allowsEditing: upload?.allowsEditing ?? fieldType === 'avatar',
    aspect: upload?.aspect ?? (fieldType === 'avatar' ? [1, 1] : undefined),
  };
}

function matchesMimeType(
  fileMime: string,
  allowedMimes: readonly string[],
  hasExtensionFallback = false
): boolean {
  if (allowedMimes.length === 0 || allowedMimes.includes('*/*')) return true;
  const normalized = (fileMime || '').trim().toLowerCase();
  if (!normalized) {
    // Only defer to extension check when an extension is present and extension whitelist is configured
    return hasExtensionFallback;
  }

  return allowedMimes.some((pattern) => {
    const p = pattern.toLowerCase();
    if (p === '*/*' || p === normalized) return true;
    if (p.endsWith('/*')) {
      const prefix = p.slice(0, -1); // e.g. 'image/'
      return normalized.startsWith(prefix);
    }
    return false;
  });
}

function extractExtension(fileName: string): string {
  const dotIdx = fileName.lastIndexOf('.');
  return dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '';
}

/**
 * Validates candidate selected files against MIME type, file extension,
 * file size, and maximum file count rules.
 */
export function validateSelectedFiles(
  candidates: readonly FormFileAsset[],
  existingCountOrConstraints: number | FileUploadConfig | ResolvedUploadConstraints,
  maybeConstraints?: ResolvedUploadConstraints
): {
  accepted: FormFileAsset[];
  errors: string[];
} {
  const existingCount =
    typeof existingCountOrConstraints === 'number' ? existingCountOrConstraints : 0;
  const constraints: ResolvedUploadConstraints =
    typeof existingCountOrConstraints === 'number'
      ? (maybeConstraints ?? resolveUploadConstraints('file'))
      : 'sources' in existingCountOrConstraints &&
          'imageQuality' in existingCountOrConstraints &&
          typeof existingCountOrConstraints.multiple === 'boolean'
        ? (existingCountOrConstraints as ResolvedUploadConstraints)
        : resolveUploadConstraints(
            (existingCountOrConstraints as FileUploadConfig).maxFiles &&
              (existingCountOrConstraints as FileUploadConfig).maxFiles! > 1
              ? 'multipleFiles'
              : 'file',
            existingCountOrConstraints as FileUploadConfig
          );

  const errors: string[] = [];
  const accepted: FormFileAsset[] = [];

  const availableSlots = constraints.multiple
    ? Math.max(0, constraints.maxFiles - existingCount)
    : 1;

  if (candidates.length > availableSlots && constraints.multiple) {
    errors.push(`Maximum ${constraints.maxFiles} file(s) allowed.`);
  }

  for (const asset of candidates) {
    if (accepted.length >= availableSlots) break;

    const rawExt = asset.extension ?? extractExtension(asset.name);
    const ext = rawExt
      ? rawExt.startsWith('.')
        ? rawExt.toLowerCase()
        : `.${rawExt.toLowerCase()}`
      : '';
    const hasExplicitMime = Boolean(asset.mimeType && asset.mimeType.trim());
    const hasSpecificMimeWhitelist =
      constraints.allowedMimeTypes.length > 0 &&
      !constraints.allowedMimeTypes.includes('*/*');

    if (
      !matchesMimeType(
        asset.mimeType,
        constraints.allowedMimeTypes,
        constraints.allowedExtensions.length > 0 && Boolean(ext)
      )
    ) {
      errors.push(
        `"${asset.name}" has unsupported file type (${asset.mimeType || 'unknown'}).`
      );
      continue;
    }

    if (constraints.allowedExtensions.length > 0) {
      if (ext) {
        if (!constraints.allowedExtensions.includes(ext)) {
          errors.push(
            `"${asset.name}" must be one of: ${constraints.allowedExtensions.join(', ')}.`
          );
          continue;
        }
      } else if (!(hasExplicitMime && hasSpecificMimeWhitelist)) {
        errors.push(
          `"${asset.name}" is missing a valid extension (${constraints.allowedExtensions.join(', ')}).`
        );
        continue;
      }
    }

    if (typeof asset.size === 'number' && (Number.isNaN(asset.size) || asset.size < 0)) {
      errors.push(`"${asset.name}" reported an invalid file size.`);
      continue;
    }

    if (
      constraints.maxFileSize !== undefined &&
      asset.size > 0 &&
      asset.size > constraints.maxFileSize
    ) {
      errors.push(
        `"${asset.name}" (${formatFileSize(asset.size)}) exceeds the maximum size of ${formatFileSize(constraints.maxFileSize)}.`
      );
      continue;
    }

    if (
      constraints.minFileSize !== undefined &&
      typeof asset.size === 'number' &&
      asset.size >= 0 &&
      asset.size < constraints.minFileSize
    ) {
      errors.push(
        `"${asset.name}" (${formatFileSize(asset.size)}) is smaller than the minimum size of ${formatFileSize(constraints.minFileSize)}.`
      );
      continue;
    }

    accepted.push({
      ...asset,
      extension: ext || undefined,
      status: asset.status ?? 'selected',
      progress: asset.progress ?? 100,
    });
  }

  return { accepted, errors };
}

function makeAssetId(): string {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function pickViaWebInput(
  constraints: ResolvedUploadConstraints,
  captureCamera = false
): Promise<FormFileAsset[]> {
  if (typeof document === 'undefined') return [];

  return new Promise<FormFileAsset[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = constraints.multiple;
    const acceptList = [
      ...constraints.allowedMimeTypes.filter((m) => m !== '*/*'),
      ...constraints.allowedExtensions,
    ];
    if (acceptList.length > 0) {
      input.accept = acceptList.join(',');
    }
    if (captureCamera) {
      input.setAttribute('capture', 'environment');
    }

    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      const mapped: FormFileAsset[] = files.map((f) => ({
        id: makeAssetId(),
        name: f.name,
        uri: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(f) : f.name,
        mimeType: f.type || 'application/octet-stream',
        size: f.size,
        extension: extractExtension(f.name) || undefined,
        source: captureCamera ? 'camera' : 'files',
        status: 'selected',
      }));
      resolve(mapped);
    };

    input.oncancel = () => resolve([]);
    input.click();
  });
}

/**
 * Triggers native system camera or photo library via `expo-image-picker`
 * (with Web input fallback when running in a browser).
 */
export async function pickFromCameraOrGallery(
  source: 'camera' | 'gallery',
  fieldType: FieldType,
  constraints: ResolvedUploadConstraints
): Promise<FormFileAsset[]> {
  if (Platform.OS === 'web') {
    return pickViaWebInput(constraints, source === 'camera');
  }

  const ImagePicker = await import('expo-image-picker');

  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Camera permission is required to capture media.');
    }
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      throw new Error('Photo library permission is required to select media.');
    }
  }

  const mediaTypes: ('images' | 'videos')[] =
    fieldType === 'video' ? ['videos'] : ['images'];

  const pickerOptions = {
    mediaTypes,
    allowsEditing: !constraints.multiple && constraints.allowsEditing,
    aspect: constraints.aspect ? ([...constraints.aspect] as [number, number]) : undefined,
    quality: constraints.imageQuality,
    allowsMultipleSelection: source === 'gallery' && constraints.multiple,
    selectionLimit: constraints.multiple ? constraints.maxFiles : 1,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

  if (result.canceled || !result.assets) {
    return [];
  }

  return result.assets.map((a) => {
    const fallbackName = a.fileName ?? a.uri.split('/').pop() ?? `${source}_${Date.now()}.jpg`;
    return {
      id: makeAssetId(),
      name: fallbackName,
      uri: a.uri,
      mimeType: a.mimeType ?? (fieldType === 'video' ? 'video/mp4' : 'image/jpeg'),
      size: a.fileSize ?? 0,
      extension: extractExtension(fallbackName) || undefined,
      width: a.width,
      height: a.height,
      duration: a.duration ?? undefined,
      source,
      status: 'selected',
    };
  });
}

/**
 * Triggers native system document selector via `expo-document-picker`
 * (with Web input fallback when running in a browser).
 */
export async function pickFromDocumentSystem(
  constraints: ResolvedUploadConstraints
): Promise<FormFileAsset[]> {
  if (Platform.OS === 'web') {
    return pickViaWebInput(constraints, false);
  }

  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: constraints.allowedMimeTypes.length > 0 ? constraints.allowedMimeTypes : '*/*',
    multiple: constraints.multiple,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets) {
    return [];
  }

  return result.assets.map((a) => ({
    id: makeAssetId(),
    name: a.name,
    uri: a.uri,
    mimeType: a.mimeType ?? 'application/octet-stream',
    size: a.size ?? 0,
    extension: extractExtension(a.name) || undefined,
    source: 'files',
    status: 'selected',
  }));
}

export type ServerUploadVerificationCheck =
  | 'authenticatedSession'
  | 'magicByteSniffing'
  | 'contentLengthLimit'
  | 'serverGeneratedStorageKey'
  | 'malwareScan';

export interface ServerUploadFieldPolicy {
  fieldPath: string;
  fieldType: FieldType;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxFileSize?: number;
  minFileSize?: number;
  maxFiles: number;
  multiple: boolean;
  requiredServerChecks: readonly ServerUploadVerificationCheck[];
}

const UPLOAD_FIELD_TYPES = new Set<FieldType>([
  'file',
  'multipleFiles',
  'image',
  'multipleImages',
  'avatar',
  'camera',
  'video',
  'audio',
  'documentScan',
]);

/**
 * Extracts a deterministic server-side upload verification policy manifest
 * from a `FormConfig`.
 *
 * Security boundary note:
 * Client-side MIME, extension, and size checks in `validateSelectedFiles()`
 * are UX pre-flights only — `mimeType`, `name`, and `size` reported by mobile/web
 * pickers can be spoofed by a modified client. Upload ingestion endpoints MUST
 * independently enforce:
 * 1. Authenticated/authorized upload session (`authenticatedSession`)
 * 2. Magic-byte / file-signature inspection (`magicByteSniffing`)
 * 3. Hard stream byte-length enforcement (`contentLengthLimit`)
 * 4. Server-generated UUID storage keys with sanitized `Content-Disposition` (`serverGeneratedStorageKey`)
 * 5. Asynchronous malware/AV scanning (`malwareScan`)
 */
export function buildServerUploadPolicyManifest(
  config: FormConfig
): ServerUploadFieldPolicy[] {
  const policies: ServerUploadFieldPolicy[] = [];
  const requiredServerChecks: readonly ServerUploadVerificationCheck[] = [
    'authenticatedSession',
    'magicByteSniffing',
    'contentLengthLimit',
    'serverGeneratedStorageKey',
    'malwareScan',
  ];

  const visitFields = (fields: readonly FieldConfig[], prefix = '') => {
    for (const field of fields) {
      const path = field.name
        ? prefix
          ? `${prefix}.${field.name}`
          : field.name
        : prefix;

      if (field.name && UPLOAD_FIELD_TYPES.has(field.type)) {
        const resolved = resolveUploadConstraints(field.type, field.upload);
        policies.push({
          fieldPath: path,
          fieldType: field.type,
          allowedMimeTypes: [...resolved.allowedMimeTypes],
          allowedExtensions: [...resolved.allowedExtensions],
          maxFileSize: resolved.maxFileSize,
          minFileSize: resolved.minFileSize,
          maxFiles: resolved.maxFiles,
          multiple: resolved.multiple,
          requiredServerChecks,
        });
      }

      if (field.fields) {
        const nextPrefix =
          field.type === 'repeater' && field.name
            ? `${path}[]`
            : field.type === 'objectGroup' && field.name
              ? path
              : prefix;
        visitFields(field.fields, nextPrefix);
      }

      if (field.steps) {
        for (const step of field.steps) {
          visitFields(step.fields, prefix);
        }
      }
    }
  };

  if (config.fields) {
    visitFields(config.fields);
  }
  if (config.sections) {
    for (const sec of config.sections) {
      const inlineFields = sec.fields.filter(
        (entry): entry is FieldConfig => typeof entry !== 'string'
      );
      if (inlineFields.length > 0) {
        visitFields(inlineFields);
      }
    }
  }
  if (config.steps) {
    for (const step of config.steps) {
      visitFields(step.fields);
    }
  }

  return policies;
}
