import './globals.css';
import localFont from 'next/font/local';
import { Toaster } from 'react-hot-toast';

// Bundled with the app (SIL Open Font License), so builds and pages need no internet.
const sans = localFont({
  src: './fonts/PlusJakartaSans-Variable.woff2',
  weight: '200 800',
  variable: '--font-sans',
  display: 'swap',
});

export const metadata = {
  title: { default: 'Transur — Rides & Deliveries', template: '%s · Transur' },
  description: 'Book a ride or send a parcel in seconds. Name your price, pick your driver, track every metre.',
  manifest: '/manifest.json',
  icons: { icon: '/icons/icon.svg', apple: '/icons/icon.svg' },
  appleWebApp: { capable: true, title: 'Transur', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#5B3DF5',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="font-sans">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3500,
            style: { background: '#0E0E1A', color: '#fff', borderRadius: '14px', fontSize: '14px', fontWeight: 500 },
          }}
        />
      </body>
    </html>
  );
}
