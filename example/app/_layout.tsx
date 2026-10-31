import React from 'react';
import { Pressable, StyleSheet, Text as RNText, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Drawer,
  DrawerContentScrollView,
  DrawerItemList,
  type DrawerContentComponentProps,
} from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';

import { AppSettingsProvider, useAppSettings } from '@/components/AppSettingsContext';

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { locale, colorScheme, toggleLocale, toggleColorScheme } = useAppSettings();
  const isDark = colorScheme === 'dark';

  const bg = isDark ? '#09090B' : '#FFFFFF';
  const cardBg = isDark ? '#18181B' : '#F8FAFC';
  const border = isDark ? '#27272A' : '#E2E8F0';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#A1A1AA' : '#64748B';

  return (
    <View style={[styles.drawerRoot, { backgroundColor: bg }]}>
      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.drawerScrollContent}
      >
        {/* Brand Header */}
        <View style={[styles.brandCard, { backgroundColor: cardBg, borderColor: border }]}>
          <View style={styles.brandRow}>
            <View style={styles.brandLogo}>
              <Ionicons name="layers" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.brandTextCol}>
              <RNText style={[styles.brandTitle, { color: textPrimary }]}>
                ExpoForm Studio
              </RNText>
              <RNText style={[styles.brandSub, { color: textSecondary }]}>
                88 Native Fields • 8 JSON Forms
              </RNText>
            </View>
          </View>

          <View style={styles.quickToggleRow}>
            <Pressable
              onPress={toggleLocale}
              style={[styles.pillButton, { borderColor: border, backgroundColor: bg }]}
            >
              <Ionicons name="language-outline" size={14} color="#2563EB" />
              <RNText style={[styles.pillLabel, { color: textPrimary }]}>
                {locale === 'en' ? 'اردو (RTL)' : 'English'}
              </RNText>
            </Pressable>

            <Pressable
              onPress={toggleColorScheme}
              style={[styles.pillButton, { borderColor: border, backgroundColor: bg }]}
            >
              <Ionicons
                name={isDark ? 'sunny-outline' : 'moon-outline'}
                size={14}
                color="#2563EB"
              />
              <RNText style={[styles.pillLabel, { color: textPrimary }]}>
                {isDark ? 'Light' : 'Dark'}
              </RNText>
            </Pressable>
          </View>
        </View>

        <RNText style={[styles.sectionCaption, { color: textSecondary }]}>
          FORM PAGES
        </RNText>

        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      <View style={[styles.drawerFooter, { borderTopColor: border }]}>
        <RNText style={[styles.footerText, { color: textSecondary }]}>
          Powered by @expo/ui & AJV 2020-12
        </RNText>
      </View>
    </View>
  );
}

function DrawerShell() {
  const { width } = useWindowDimensions();
  const { locale, colorScheme, toggleLocale, toggleColorScheme } = useAppSettings();
  const isDark = colorScheme === 'dark';
  const isPermanent = width >= 1024;

  const headerBg = isDark ? '#09090B' : '#FFFFFF';
  const headerFg = isDark ? '#F8FAFC' : '#0F172A';
  const borderCol = isDark ? '#27272A' : '#E2E8F0';
  const drawerActiveBg = isDark ? '#1E3A8A33' : '#EFF6FF';
  const drawerInactiveFg = isDark ? '#A1A1AA' : '#475569';

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          drawerType: isPermanent ? 'permanent' : 'front',
          headerLeft: isPermanent ? () => null : undefined,
          headerStyle: {
            backgroundColor: headerBg,
            borderBottomWidth: 1,
            borderBottomColor: borderCol,
          },
          headerTintColor: headerFg,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 16,
          },
          drawerStyle: {
            width: 286,
            backgroundColor: headerBg,
            borderRightColor: borderCol,
            borderRightWidth: 1,
          },
          drawerActiveTintColor: '#2563EB',
          drawerActiveBackgroundColor: drawerActiveBg,
          drawerInactiveTintColor: drawerInactiveFg,
          drawerLabelStyle: {
            fontSize: 14,
            fontWeight: '600',
          },
          drawerItemStyle: {
            borderRadius: 10,
            marginHorizontal: 6,
            marginVertical: 2,
          },
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable
                onPress={toggleLocale}
                style={[styles.headerBtn, { borderColor: borderCol }]}
              >
                <RNText style={[styles.headerBtnText, { color: headerFg }]}>
                  {locale === 'en' ? 'اردو' : 'EN'}
                </RNText>
              </Pressable>
              <Pressable
                onPress={toggleColorScheme}
                style={[styles.headerBtn, { borderColor: borderCol }]}
              >
                <Ionicons
                  name={isDark ? 'sunny-outline' : 'moon-outline'}
                  size={16}
                  color={headerFg}
                />
              </Pressable>
            </View>
          ),
        }}
      >
        <Drawer.Screen
          name="index"
          options={{
            title: 'Form Gallery',
            drawerLabel: 'Form Gallery (Home)',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="grid-outline" size={size} color={String(color)} />
            ),
          }}
        />
        <Drawer.Screen
          name="custom-builder"
          options={{
            title: 'Custom form.json Studio',
            drawerLabel: 'Custom form.json Builder',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="code-slash-outline" size={size} color={String(color)} />
            ),
          }}
        />
        <Drawer.Screen
          name="register"
          options={{
            title: 'Register (All 88 Field Types)',
            drawerLabel: 'Register (All 88 Fields)',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="person-add-outline" size={size} color={String(color)} />
            ),
          }}
        />
        <Drawer.Screen
          name="login"
          options={{
            title: 'Login / Sign In',
            drawerLabel: 'Login Form',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="log-in-outline" size={size} color={String(color)} />
            ),
          }}
        />
        <Drawer.Screen
          name="forgot-password"
          options={{
            title: 'Password Recovery Wizard',
            drawerLabel: 'Forgot Password',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="key-outline" size={size} color={String(color)} />
            ),
          }}
        />
        <Drawer.Screen
          name="checkout"
          options={{
            title: 'E-Commerce Checkout',
            drawerLabel: 'Checkout & Payment',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="cart-outline" size={size} color={String(color)} />
            ),
          }}
        />
        <Drawer.Screen
          name="kyc-wizard"
          options={{
            title: 'Merchant KYC Wizard',
            drawerLabel: 'KYC Onboarding Wizard',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="shield-checkmark-outline" size={size} color={String(color)} />
            ),
          }}
        />
        <Drawer.Screen
          name="enterprise-vehicle"
          options={{
            title: 'Enterprise Vehicle Assessment',
            drawerLabel: 'Enterprise Vehicle (v2)',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="car-sport-outline" size={size} color={String(color)} />
            ),
          }}
        />
        <Drawer.Screen
          name="job-application"
          options={{
            title: 'Job Application',
            drawerLabel: 'Job Application',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="briefcase-outline" size={size} color={String(color)} />
            ),
          }}
        />
        <Drawer.Screen
          name="contact-support"
          options={{
            title: 'Contact & Support Ticket',
            drawerLabel: 'Contact & Support',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles-outline" size={size} color={String(color)} />
            ),
          }}
        />
        <Drawer.Screen
          name="feedback-survey"
          options={{
            title: 'Product Feedback Survey',
            drawerLabel: 'Feedback Survey',
            drawerIcon: ({ color, size }) => (
              <Ionicons name="star-outline" size={size} color={String(color)} />
            ),
          }}
        />
      </Drawer>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flexOne}>
      <SafeAreaProvider>
        <AppSettingsProvider>
          <DrawerShell />
        </AppSettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  drawerRoot: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingTop: 12,
    paddingBottom: 20,
  },
  brandCard: {
    marginHorizontal: 12,
    marginBottom: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextCol: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  brandSub: {
    fontSize: 12,
    marginTop: 2,
  },
  quickToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pillButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionCaption: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginHorizontal: 18,
    marginBottom: 6,
  },
  drawerFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 11,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 14,
  },
  headerBtn: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
