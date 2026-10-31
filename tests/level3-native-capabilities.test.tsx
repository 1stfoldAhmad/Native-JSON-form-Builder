import React, { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ExpoForm,
  PlatformCapabilityRegistry,
  defaultCapabilityRegistry,
  defineFormConfig,
  parseNumericInput,
  resolvePluralizedText,
  resolveResponsiveColumnCount,
  type ExpoFormRef,
} from '../src';

describe('Level 3 (Phase 4) — Platform Capabilities, Native Scanners, Responsive Grid & Locale Numerals', () => {
  afterEach(() => {
    defaultCapabilityRegistry.clearOverrides();
    defaultCapabilityRegistry.registerBarcodeScannerAdapter(undefined);
    defaultCapabilityRegistry.registerDocumentScannerAdapter(undefined);
    defaultCapabilityRegistry.registerSignatureAdapter(undefined);
    defaultCapabilityRegistry.registerLocationAdapter(undefined);
  });

  it('validates schema capability requirements and reports explicit fallbacks when hardware adapters are absent', () => {
    const capRegistry = new PlatformCapabilityRegistry({
      barcodeScanner: false,
      documentScanner: false,
    });

    const strictConfig = defineFormConfig({
      id: 'strict-scanner-form',
      capabilities: {
        required: ['barcodeScanner'],
        optional: ['documentScanner'],
      },
      fields: [
        { name: 'chassisBarcode', type: 'barcode' },
        { name: 'registrationBook', type: 'documentScan' },
      ],
    });

    const report1 = capRegistry.validateSchemaCapabilities(strictConfig);
    expect(report1.compatible).toBe(false);
    expect(report1.missingRequired).toEqual(['barcodeScanner']);
    expect(report1.degradedOptional).toEqual(['documentScanner']);
    expect(report1.issues[0].fallbackDescription).toMatch(/Manual @expo\/ui TextInput/);

    // Registering the barcodeScanner adapter satisfies the required capability
    capRegistry.clearOverrides();
    const unregister = capRegistry.registerBarcodeScannerAdapter({
      scanCode: async () => ({ data: 'VIN-9001', format: 'qr' }),
    });
    const report2 = capRegistry.validateSchemaCapabilities(strictConfig);
    expect(report2.compatible).toBe(true);
    expect(report2.missingRequired).toEqual([]);
    unregister();
  });

  it('renders @expo/ui barcode, documentScan, drawn signature, and GPS coordinates adapters with duplicate & regex guards', async () => {
    let scanSeq = 0;
    defaultCapabilityRegistry.registerBarcodeScannerAdapter({
      scanCode: async () => {
        scanSeq += 1;
        return {
          data: scanSeq <= 2 ? 'VIN:PK-987654' : 'VIN:PK-111222',
          format: 'qr',
        };
      },
    });

    defaultCapabilityRegistry.registerDocumentScannerAdapter({
      scanDocument: async () => ({
        pages: [],
        mergedPdf: {
          id: 'doc_scan_1',
          name: 'scanned-title-deed.pdf',
          uri: 'file:///scanned-title-deed.pdf',
          mimeType: 'application/pdf',
          size: 40_960,
        },
      }),
    });

    defaultCapabilityRegistry.registerSignatureAdapter({
      captureSignature: async () => ({
        uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
        mimeType: 'image/png',
        width: 320,
        height: 120,
      }),
    });

    defaultCapabilityRegistry.registerLocationAdapter({
      getCurrentPosition: async () => ({
        latitude: 33.5651,
        longitude: 73.0169,
        accuracyMeters: 5,
      }),
    });

    const formRef = createRef<ExpoFormRef>();
    const config = defineFormConfig({
      id: 'native-hardware-suite',
      fields: [
        {
          name: 'vinCode',
          type: 'qrCode',
          label: 'Vehicle QR',
          scan: {
            formats: ['qr'],
            extractPattern: '^VIN:([A-Z0-9-]+)$',
            preventDuplicates: true,
          },
        },
        {
          name: 'titleDeed',
          type: 'documentScan',
          label: 'Title Deed Scan',
        },
        {
          name: 'inspectorSign',
          type: 'signature',
          label: 'Inspector Signature',
        },
        {
          name: 'inspectionCoords',
          type: 'coordinates',
          label: 'Inspection GPS',
        },
      ],
    });

    render(<ExpoForm ref={formRef} config={config} />);

    // 1. Scan QR -> extracts capture group `PK-987654`
    fireEvent.click(screen.getByTestId('barcode-scan-btn-vinCode'));
    await waitFor(() => {
      expect(formRef.current?.getValue('vinCode')).toBe('PK-987654');
    });

    // 2. Scanning identical QR a second time triggers duplicate-scan guard!
    fireEvent.click(screen.getByTestId('barcode-scan-btn-vinCode'));
    await waitFor(() => {
      expect(formRef.current?.getFieldState('vinCode').error).toMatch(
        /Duplicate code "PK-987654"/
      );
    });

    // 3. Scan multi-page document -> attaches PDF asset
    fireEvent.click(screen.getByTestId('upload-docscan-titleDeed'));
    await waitFor(() => {
      expect(screen.getByText('scanned-title-deed.pdf')).toBeTruthy();
    });

    // 4. Capture native drawn signature PNG
    fireEvent.click(screen.getByTestId('signature-open-inspectorSign'));
    await waitFor(() => {
      expect(screen.getByText('Signed: drawn')).toBeTruthy();
    });

    // 5. Capture GPS coordinates
    fireEvent.click(screen.getByTestId('coords-gps-inspectionCoords'));
    await waitFor(() => {
      expect(formRef.current?.getValue('inspectionCoords')).toEqual({
        latitude: 33.5651,
        longitude: 73.0169,
      });
    });
  });

  it('resolves 3-tier phone/tablet/desktop grid columns and parses Eastern Arabic, Urdu, and European numerals consistently', () => {
    const layout = {
      columns: 1,
      tabletColumns: 2,
      tabletBreakpoint: 768,
      desktopColumns: 4,
      desktopBreakpoint: 1200,
    };

    expect(resolveResponsiveColumnCount(390, layout)).toBe(1);
    expect(resolveResponsiveColumnCount(820, layout)).toBe(2);
    expect(resolveResponsiveColumnCount(1280, layout)).toBe(4);

    // Eastern Arabic (`٠-٩`) & Arabic decimal separator (`٫`)
    expect(parseNumericInput('١٬٢٣٤٫٥٦', { precision: 2, locale: 'ar-SA' })).toBe(
      1234.56
    );
    // Extended Arabic-Indic / Urdu-Persian (`۰-۹`)
    expect(parseNumericInput('۹۸۷۶', { integerOnly: true, locale: 'ur-PK' })).toBe(9876);
    // European comma decimal (`de-DE`)
    expect(parseNumericInput('1.234,56', { precision: 2, locale: 'de-DE' })).toBe(
      1234.56
    );
    // Pluralization helper
    expect(
      resolvePluralizedText(1, {
        zero: 'No files',
        one: '{{count}} file selected',
        other: '{{count}} files selected',
      })
    ).toBe('1 file selected');
    expect(
      resolvePluralizedText(3, {
        zero: 'No files',
        one: '{{count}} file selected',
        other: '{{count}} files selected',
      })
    ).toBe('3 files selected');
  });
});
