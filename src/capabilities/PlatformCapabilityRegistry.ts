import { Platform } from 'react-native';

import { compileFormSchema } from '../compiler';
import type {
  FormConfig,
  PlatformCapabilities,
  PlatformCapabilityName,
} from '../types';
import type {
  BarcodeScannerAdapter,
  DocumentScannerAdapter,
  LocationCaptureAdapter,
  SignatureCaptureAdapter,
} from './adapters';

export interface CapabilityCheckIssue {
  capability: PlatformCapabilityName;
  requirement: 'required' | 'optional';
  available: boolean;
  fallbackDescription: string;
  message: string;
}

export interface SchemaCapabilityReport {
  compatible: boolean;
  capabilities: PlatformCapabilities;
  missingRequired: PlatformCapabilityName[];
  degradedOptional: PlatformCapabilityName[];
  issues: CapabilityCheckIssue[];
}

const FALLBACK_DESCRIPTIONS: Record<PlatformCapabilityName, string> = {
  camera: 'System file picker upload fallback',
  gallery: 'System document/file picker fallback',
  documentScanner: 'Standard camera/file upload fallback',
  signature: 'Typed / stroke-pad @expo/ui signature fallback',
  barcodeScanner: 'Manual @expo/ui TextInput code entry fallback',
  location: 'Manual latitude/longitude & address entry fallback',
  nativeDatePicker: 'ISO date/time @expo/ui picker fallback',
  nativeColorPicker: 'Preset swatch & hex @expo/ui color input fallback',
};

/**
 * Explicit Platform Capability Model & Hardware Adapter Registry for iOS, Android, and Web.
 * Keeps optional native SDKs (`expo-camera`, `expo-location`, document scanners, canvas pads)
 * decoupled from the core runtime bundle while providing deterministic fallbacks.
 */
export class PlatformCapabilityRegistry {
  private overrides: Partial<PlatformCapabilities> = {};
  private documentScannerAdapter?: DocumentScannerAdapter;
  private signatureAdapter?: SignatureCaptureAdapter;
  private barcodeScannerAdapter?: BarcodeScannerAdapter;
  private locationAdapter?: LocationCaptureAdapter;

  constructor(initialOverrides?: Partial<PlatformCapabilities>) {
    if (initialOverrides) {
      this.overrides = { ...initialOverrides };
    }
  }

  public setCapabilityOverrides(next: Partial<PlatformCapabilities>): void {
    this.overrides = { ...this.overrides, ...next };
  }

  public clearOverrides(): void {
    this.overrides = {};
  }

  public registerDocumentScannerAdapter(
    adapter: DocumentScannerAdapter | undefined
  ): () => void {
    this.documentScannerAdapter = adapter;
    return () => {
      if (this.documentScannerAdapter === adapter) {
        this.documentScannerAdapter = undefined;
      }
    };
  }

  public getDocumentScannerAdapter(): DocumentScannerAdapter | undefined {
    return this.documentScannerAdapter;
  }

  public registerSignatureAdapter(
    adapter: SignatureCaptureAdapter | undefined
  ): () => void {
    this.signatureAdapter = adapter;
    return () => {
      if (this.signatureAdapter === adapter) {
        this.signatureAdapter = undefined;
      }
    };
  }

  public getSignatureAdapter(): SignatureCaptureAdapter | undefined {
    return this.signatureAdapter;
  }

  public registerBarcodeScannerAdapter(
    adapter: BarcodeScannerAdapter | undefined
  ): () => void {
    this.barcodeScannerAdapter = adapter;
    return () => {
      if (this.barcodeScannerAdapter === adapter) {
        this.barcodeScannerAdapter = undefined;
      }
    };
  }

  public getBarcodeScannerAdapter(): BarcodeScannerAdapter | undefined {
    return this.barcodeScannerAdapter;
  }

  public registerLocationAdapter(
    adapter: LocationCaptureAdapter | undefined
  ): () => void {
    this.locationAdapter = adapter;
    return () => {
      if (this.locationAdapter === adapter) {
        this.locationAdapter = undefined;
      }
    };
  }

  public getLocationAdapter(): LocationCaptureAdapter | undefined {
    return this.locationAdapter;
  }

  public detectCapabilities(): PlatformCapabilities {
    const isNativeMobile = Platform.OS === 'ios' || Platform.OS === 'android';
    const hasWebGeolocation =
      typeof navigator !== 'undefined' && Boolean(navigator.geolocation);

    const detected: PlatformCapabilities = {
      camera: isNativeMobile,
      gallery: true,
      documentScanner: Boolean(this.documentScannerAdapter),
      signature: true,
      barcodeScanner: Boolean(this.barcodeScannerAdapter),
      location: Boolean(this.locationAdapter) || hasWebGeolocation,
      nativeDatePicker: true,
      nativeColorPicker: isNativeMobile,
    };

    return {
      ...detected,
      ...this.overrides,
    };
  }

  public isCapabilityAvailable(name: PlatformCapabilityName): boolean {
    return Boolean(this.detectCapabilities()[name]);
  }

  /**
   * Validates a `FormConfig`'s required and optional capabilities against the active
   * platform and registered adapters, returning actionable compatibility diagnostics.
   */
  public validateSchemaCapabilities(config: FormConfig): SchemaCapabilityReport {
    const plan = compileFormSchema(config);
    const capabilities = this.detectCapabilities();
    const missingRequired: PlatformCapabilityName[] = [];
    const degradedOptional: PlatformCapabilityName[] = [];
    const issues: CapabilityCheckIssue[] = [];

    for (const reqCap of plan.requiredCapabilities) {
      const available = Boolean(capabilities[reqCap]);
      if (!available) {
        missingRequired.push(reqCap);
        issues.push({
          capability: reqCap,
          requirement: 'required',
          available: false,
          fallbackDescription: FALLBACK_DESCRIPTIONS[reqCap],
          message: `Required platform capability "${reqCap}" is unavailable on ${Platform.OS}. Register the corresponding adapter or switch to optional fallback.`,
        });
      }
    }

    for (const optCap of plan.optionalCapabilities) {
      const available = Boolean(capabilities[optCap]);
      if (!available) {
        degradedOptional.push(optCap);
        issues.push({
          capability: optCap,
          requirement: 'optional',
          available: false,
          fallbackDescription: FALLBACK_DESCRIPTIONS[optCap],
          message: `Optional capability "${optCap}" is unavailable on ${Platform.OS}; using ${FALLBACK_DESCRIPTIONS[optCap]}.`,
        });
      }
    }

    return {
      compatible: missingRequired.length === 0,
      capabilities,
      missingRequired,
      degradedOptional,
      issues,
    };
  }
}

export const defaultCapabilityRegistry = new PlatformCapabilityRegistry();
