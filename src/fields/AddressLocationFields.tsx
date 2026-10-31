import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Column,
  Row,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';

import { defaultCapabilityRegistry } from '../capabilities/PlatformCapabilityRegistry';
import { useActiveForm } from '../core/context';
import { FormIcon } from '../icons/IconRenderer';
import { useFieldOptions } from '../pickers/optionsLoader';
import { SearchablePicker } from '../pickers/SearchablePicker';
import type { FieldRendererProps } from '../types';
import { getCountryOptions } from '../utils/countries';
import { resolveLocalizedText } from '../utils/formatting';
import { TextPersonalFieldRenderer } from './TextPersonalFields';

/**
 * Unified native renderer for all 9 Category E Address & Location fields:
 * `address`, `addressLine1`, `addressLine2`, `country`, `state`, `city`,
 * `postalCode`, `coordinates`, and `locationSearch`.
 *
 * Address autocomplete and live location results integrate via registered `dataSources`
 * rather than hardcoding provider URLs or keys into JSON.
 */
export function AddressLocationFieldRenderer(props: FieldRendererProps) {
  switch (props.field.type) {
    case 'address':
      return (
        <TextPersonalFieldRenderer
          {...props}
          field={{
            ...props.field,
            type: 'textarea',
            autoComplete: props.field.autoComplete ?? 'street-address',
            numberOfLines: props.field.numberOfLines ?? 3,
            placeholder: props.field.placeholder ?? 'Street address, apartment, city, postal code',
          }}
        />
      );

    case 'addressLine1':
      return (
        <TextPersonalFieldRenderer
          {...props}
          field={{
            ...props.field,
            type: 'text',
            autoCapitalize: 'words',
            autoComplete: props.field.autoComplete ?? 'address-line1',
            placeholder: props.field.placeholder ?? 'Street address, P.O. box',
          }}
        />
      );

    case 'addressLine2':
      return (
        <TextPersonalFieldRenderer
          {...props}
          field={{
            ...props.field,
            type: 'text',
            autoCapitalize: 'words',
            autoComplete: props.field.autoComplete ?? 'address-line2',
            placeholder: props.field.placeholder ?? 'Apartment, suite, unit, building, floor',
          }}
        />
      );

    case 'postalCode':
      return (
        <TextPersonalFieldRenderer
          {...props}
          field={{
            ...props.field,
            type: 'text',
            autoCapitalize: 'characters',
            autoCorrect: false,
            autoComplete: props.field.autoComplete ?? 'postal-code',
            placeholder: props.field.placeholder ?? 'Postal / ZIP code',
          }}
        />
      );

    case 'country':
      return (
        <SearchablePicker
          {...props}
          multiple={false}
          overrideOptions={
            props.field.options || props.field.dataSource
              ? undefined
              : getCountryOptions(props.field.allowedCountries)
          }
          field={{
            ...props.field,
            placeholder: props.field.placeholder ?? 'Select country',
            searchPlaceholder: props.field.searchPlaceholder ?? 'Search countries...',
          }}
        />
      );

    case 'state':
      return (
        <SearchablePicker
          {...props}
          multiple={false}
          field={{
            ...props.field,
            placeholder: props.field.placeholder ?? 'Select state / province',
            searchPlaceholder: props.field.searchPlaceholder ?? 'Search states...',
            dataSource:
              props.field.options || props.field.dataSource
                ? props.field.dataSource
                : {
                    id: 'statesByCountry',
                    dependsOn: [props.field.countryField ?? 'country'],
                    resetOnDependencyChange: true,
                  },
          }}
        />
      );

    case 'city':
      if (props.field.options || props.field.dataSource) {
        return (
          <SearchablePicker
            {...props}
            multiple={false}
            field={{
              ...props.field,
              placeholder: props.field.placeholder ?? 'Select city',
              searchPlaceholder: props.field.searchPlaceholder ?? 'Search cities...',
            }}
          />
        );
      }
      // If a sibling `state` field exists in form values, bind dependent city picker; otherwise free-text city
      if (props.getFieldValue('state') !== undefined) {
        return (
          <SearchablePicker
            {...props}
            multiple={false}
            field={{
              ...props.field,
              placeholder: props.field.placeholder ?? 'Select city',
              searchPlaceholder: props.field.searchPlaceholder ?? 'Search cities...',
              dataSource: {
                id: 'citiesByState',
                dependsOn: ['state'],
                resetOnDependencyChange: true,
              },
            }}
          />
        );
      }
      return (
        <TextPersonalFieldRenderer
          {...props}
          field={{
            ...props.field,
            type: 'text',
            autoCapitalize: 'words',
            placeholder: props.field.placeholder ?? 'City',
          }}
        />
      );

    case 'coordinates':
      return <CoordinatesField {...props} />;

    case 'locationSearch':
      return <LocationSearchField {...props} />;

    default:
      return <TextPersonalFieldRenderer {...props} />;
  }
}

function CoordinatesField({
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  styles,
}: FieldRendererProps) {
  const { store } = useActiveForm();
  const coords =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { latitude?: number | string; longitude?: number | string })
      : { latitude: '', longitude: '' };

  const latStr = coords.latitude === undefined ? '' : String(coords.latitude);
  const lngStr = coords.longitude === undefined ? '' : String(coords.longitude);
  const latState = useNativeState<string>(latStr);
  const lngState = useNativeState<string>(lngStr);

  const externalVersion = store.getExternalVersion(fieldPath);
  const lastSyncedRef = useRef<number>(externalVersion);

  useEffect(() => {
    if (lastSyncedRef.current !== externalVersion) {
      lastSyncedRef.current = externalVersion;
      if (latState.get() !== latStr) latState.set(latStr);
      if (lngState.get() !== lngStr) lngState.set(lngStr);
    }
  }, [externalVersion, latStr, lngStr, latState, lngState]);

  const locationAdapter = defaultCapabilityRegistry.getLocationAdapter();
  const [locating, setLocating] = useState(false);

  const handleCaptureGps = async () => {
    if (!locationAdapter || disabled || readOnly || locating) return;
    setLocating(true);
    try {
      const pos = await locationAdapter.getCurrentPosition({ enableHighAccuracy: true });
      if (pos) {
        latState.set(String(pos.latitude));
        lngState.set(String(pos.longitude));
        onChange({
          latitude: pos.latitude,
          longitude: pos.longitude,
        });
      }
    } catch (err) {
      store.setError(
        fieldPath,
        err instanceof Error ? err.message : 'Unable to determine current location'
      );
    } finally {
      setLocating(false);
    }
  };

  return (
    <Column spacing={8} style={{ width: '100%' }}>
      <Row spacing={10} alignment="center" style={{ width: '100%' }}>
        <Column spacing={4} style={{ width: '48%' }}>
          <Text textStyle={styles.descriptionStyle}>Latitude</Text>
          <TextInput
            value={latState}
            placeholder="33.6844"
            placeholderTextColor={styles.placeholderColor}
            editable={!disabled && !readOnly}
            keyboardType="decimal-pad"
            style={styles.inputStyle}
            textStyle={styles.inputTextStyle}
            testID={`coords-lat-${fieldPath}`}
            onChangeText={(txt) => {
              if (latState.get() !== txt) latState.set(txt);
              const parsed = txt.trim() === '' ? '' : Number(txt);
              onChange({
                ...coords,
                latitude: Number.isNaN(parsed as number) ? txt : parsed,
              });
            }}
            onBlur={onBlur}
          />
        </Column>
        <Column spacing={4} style={{ width: '48%' }}>
          <Text textStyle={styles.descriptionStyle}>Longitude</Text>
          <TextInput
            value={lngState}
            placeholder="73.0479"
            placeholderTextColor={styles.placeholderColor}
            editable={!disabled && !readOnly}
            keyboardType="decimal-pad"
            style={styles.inputStyle}
            textStyle={styles.inputTextStyle}
            testID={`coords-lng-${fieldPath}`}
            onChangeText={(txt) => {
              if (lngState.get() !== txt) lngState.set(txt);
              const parsed = txt.trim() === '' ? '' : Number(txt);
              onChange({
                ...coords,
                longitude: Number.isNaN(parsed as number) ? txt : parsed,
              });
            }}
            onBlur={onBlur}
          />
        </Column>
      </Row>
      {locationAdapter && !readOnly ? (
        <Button
          variant="outlined"
          disabled={disabled || locating}
          testID={`coords-gps-${fieldPath}`}
          onPress={() => void handleCaptureGps()}
          style={{ height: 42, borderRadius: 10 }}>
          <Text textStyle={{ ...styles.inputTextStyle, fontWeight: '600' }}>
            {locating ? 'Locating...' : 'Use Current Location'}
          </Text>
        </Button>
      ) : null}
    </Column>
  );
}

function LocationSearchField({
  field,
  fieldPath,
  value,
  onChange,
  onFocus,
  onBlur,
  disabled,
  readOnly,
  styles,
  locale,
  getFieldValue,
}: FieldRendererProps) {
  const { store, dataSources, config, renderIcon } = useActiveForm();
  const initialLabel =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object' && 'label' in value
        ? String((value as { label?: unknown }).label ?? '')
        : '';

  const searchState = useNativeState<string>(initialLabel);
  const [query, setQuery] = useState(initialLabel);
  const [open, setOpen] = useState(false);

  const externalVersion = store.getExternalVersion(fieldPath);
  const lastSyncedRef = useRef<number>(externalVersion);

  useEffect(() => {
    if (lastSyncedRef.current !== externalVersion) {
      lastSyncedRef.current = externalVersion;
      if (searchState.get() !== initialLabel) {
        searchState.set(initialLabel);
      }
      setQuery(initialLabel);
    }
  }, [externalVersion, initialLabel, searchState]);

  const loader = useFieldOptions({
    field: {
      ...field,
      dataSource: field.dataSource ?? 'locations',
    },
    dataSources,
    getFieldValue,
    locale,
    searchQuery: query,
  });

  const placeholder =
    resolveLocalizedText(field.placeholder, locale, config.i18n?.translations) ??
    'Search for a location...';

  return (
    <Column spacing={6} style={{ width: '100%' }}>
      <Row alignment="center" spacing={8} style={styles.inputStyle}>
        <FormIcon
          name="location"
          size={styles.iconSize}
          color={styles.iconColor}
          renderOverride={renderIcon}
        />
        <TextInput
          value={searchState}
          placeholder={placeholder}
          placeholderTextColor={styles.placeholderColor}
          editable={!disabled && !readOnly}
          returnKeyType="search"
          testID={field.testID ?? `location-search-${fieldPath}`}
          style={{
            width: '88%',
            height: styles.inputStyle.height,
            backgroundColor: 'transparent',
            borderWidth: 0,
            paddingHorizontal: 4,
          }}
          textStyle={styles.inputTextStyle}
          onFocus={() => {
            setOpen(true);
            onFocus();
          }}
          onBlur={onBlur}
          onChangeText={(txt) => {
            setQuery(txt);
            setOpen(true);
            onChange(txt);
          }}
        />
      </Row>

      {open && query.trim().length > 0 && loader.options.length > 0 ? (
        <Column
          spacing={4}
          style={{
            width: '100%',
            padding: 6,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: styles.inputStyle.borderColor ?? '#CBD5E1',
            backgroundColor: styles.inputStyle.backgroundColor ?? '#FFFFFF',
          }}>
          {loader.options.map((opt) => (
            <Button
              key={String(opt.value)}
              variant="text"
              testID={`location-option-${fieldPath}-${String(opt.value)}`}
              onPress={() => {
                searchState.set(opt.label);
                setQuery(opt.label);
                onChange(opt.meta ? { label: opt.label, value: opt.value, ...opt.meta } : opt.value);
                setOpen(false);
                onBlur();
              }}
              style={{ width: '100%', height: 40, paddingHorizontal: 8 }}>
              <Row alignment="center" spacing={8} style={{ width: '100%' }}>
                <FormIcon name="location" size={16} color={styles.tintColor} renderOverride={renderIcon} />
                <Text textStyle={styles.inputTextStyle}>{opt.label}</Text>
                <Spacer flexible />
                {opt.description ? (
                  <Text textStyle={styles.descriptionStyle}>{opt.description}</Text>
                ) : null}
              </Row>
            </Button>
          ))}
        </Column>
      ) : null}
    </Column>
  );
}
