import React from 'react';
import { Button, Column, Host, Row, ScrollView, Spacer, Text } from '@expo/ui';
import { useRouter } from 'expo-router';

import { ALL_BUILT_IN_FIELD_TYPES } from '@/components/expo-form';
import { useAppSettings } from '@/components/AppSettingsContext';
import { DEMO_FORMS } from '@/forms';

export default function HomeGalleryPage() {
  const router = useRouter();
  const { colorScheme } = useAppSettings();
  const isDark = colorScheme === 'dark';

  const pageBg = isDark ? '#09090B' : '#F1F5F9';
  const cardBg = isDark ? '#18181B' : '#FFFFFF';
  const borderCol = isDark ? '#27272A' : '#E2E8F0';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#A1A1AA' : '#475569';

  return (
    <Host
      colorScheme={colorScheme}
      seedColor="#2563EB"
      style={{ flex: 1, width: '100%', backgroundColor: pageBg }}
    >
      <ScrollView direction="vertical" style={{ width: '100%', height: '100%' }}>
        <Column
          spacing={16}
          style={{
            width: '100%',
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 36,
            backgroundColor: pageBg,
          }}
        >
          {/* Hero Summary Card */}
          <Column
            spacing={10}
            style={{
              width: '100%',
              padding: 20,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: borderCol,
              backgroundColor: cardBg,
            }}
          >
            <Row spacing={8} alignment="center" style={{ width: '100%' }}>
              <Text
                textStyle={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: '#2563EB',
                }}
              >
                EXPO SDK 58 • @EXPO/UI • EXPO ROUTER DRAWER
              </Text>
              <Spacer />
              <Text textStyle={{ fontSize: 12, fontWeight: '600', color: textSecondary }}>
                {`${ALL_BUILT_IN_FIELD_TYPES.length} Built-In Field Types`}
              </Text>
            </Row>

            <Text textStyle={{ fontSize: 22, fontWeight: '700', color: textPrimary }}>
              Native JSON Form Builder Gallery
            </Text>

            <Text textStyle={{ fontSize: 14, color: textSecondary, lineHeight: 20 }}>
              Open the navigation drawer or select any card below to test complete JSON-driven native forms — starting with the All-88-Field-Types Register Form, Multi-Mode Login, Password Recovery, E-Commerce Checkout, KYC Wizard, Job Application, Support Ticket, and Feedback Survey.
            </Text>

            <Row spacing={10} style={{ width: '100%', paddingTop: 4 }}>
              <Button
                variant="filled"
                onPress={() => router.push('/register')}
                style={{ height: 46, borderRadius: 12, paddingHorizontal: 18 }}
              >
                <Text textStyle={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
                  Open Register (All 88 Fields)
                </Text>
              </Button>
              <Button
                variant="outlined"
                onPress={() => router.push('/login')}
                style={{ height: 46, borderRadius: 12, paddingHorizontal: 18 }}
              >
                <Text textStyle={{ color: textPrimary, fontWeight: '600', fontSize: 14 }}>
                  Open Login Form
                </Text>
              </Button>
            </Row>
          </Column>

          {/* Form Directory Cards */}
          {DEMO_FORMS.map((item) => (
            <Column
              key={item.slug}
              spacing={10}
              style={{
                width: '100%',
                padding: 18,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: borderCol,
                backgroundColor: cardBg,
              }}
            >
              <Row spacing={8} alignment="center" style={{ width: '100%' }}>
                <Text textStyle={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>
                  {item.category.toUpperCase()}
                </Text>
                <Spacer />
                <Text textStyle={{ fontSize: 12, fontWeight: '700', color: '#16A34A' }}>
                  {item.badge}
                </Text>
              </Row>

              <Text textStyle={{ fontSize: 17, fontWeight: '700', color: textPrimary }}>
                {item.title}
              </Text>

              <Text textStyle={{ fontSize: 13, color: textSecondary, lineHeight: 19 }}>
                {item.subtitle}
              </Text>

              <Column spacing={4} style={{ width: '100%' }}>
                {item.highlights.map((hl) => (
                  <Text key={hl} textStyle={{ fontSize: 12, color: textSecondary }}>
                    {`• ${hl}`}
                  </Text>
                ))}
              </Column>

              <Row spacing={8} alignment="center" style={{ width: '100%', paddingTop: 4 }}>
                <Button
                  variant="filled"
                  onPress={() => router.push(item.route)}
                  style={{ height: 42, borderRadius: 10, paddingHorizontal: 16 }}
                >
                  <Text textStyle={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
                    {`Open ${item.title}`}
                  </Text>
                </Button>
              </Row>
            </Column>
          ))}
        </Column>
      </ScrollView>
    </Host>
  );
}
