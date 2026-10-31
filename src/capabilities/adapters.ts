import type { FormFileAsset } from '../types';

export interface ScannedDocumentResult {
  pages: FormFileAsset[];
  mergedPdf?: FormFileAsset;
}

export interface DocumentScannerAdapter {
  scanDocument: (options?: {
    maxPages?: number;
    outputFormat?: 'pdf' | 'jpeg' | 'png';
  }) => Promise<ScannedDocumentResult | null>;
}

export interface DrawnSignatureResult {
  /** Base64 PNG/SVG data URI or local file URI. */
  uri: string;
  mimeType: 'image/png' | 'image/svg+xml';
  width?: number;
  height?: number;
  strokes?: readonly unknown[];
}

export interface SignatureCaptureAdapter {
  captureSignature: (options?: {
    penColor?: string;
    backgroundColor?: string;
    outputFormat?: 'png' | 'svg';
  }) => Promise<DrawnSignatureResult | null>;
}

export interface BarcodeScanResult {
  data: string;
  format: string;
  rawBytes?: string;
}

export interface BarcodeScannerAdapter {
  scanCode: (options?: {
    formats?: readonly string[];
  }) => Promise<BarcodeScanResult | null>;
}

export interface GeoCoordinatesResult {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  formattedAddress?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  postalCode?: string;
}

export interface LocationCaptureAdapter {
  getCurrentPosition: (options?: {
    enableHighAccuracy?: boolean;
    timeoutMs?: number;
  }) => Promise<GeoCoordinatesResult | null>;
  reverseGeocode?: (coords: {
    latitude: number;
    longitude: number;
  }) => Promise<Partial<GeoCoordinatesResult> | null>;
}
