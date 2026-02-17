import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.podiumarena.app',
  appName: 'Podium Arena',
  webDir: 'www',
  server: {
    url: 'https://www.podiumarena.com',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    scheme: 'Podium Arena',
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
  },
};

export default config;
