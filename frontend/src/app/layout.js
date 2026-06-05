import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'Transur — Taxi & Livraison à Lubumbashi',
  description: 'Commandez un taxi ou faites livrer vos colis facilement à Lubumbashi, RDC.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Transur' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#007DC5',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="max-w-md mx-auto min-h-screen bg-white relative overflow-x-hidden">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3500,
            style: { background: '#1f2937', color: '#fff', fontSize: '14px', borderRadius: '12px' },
          }}
        />
      </body>
    </html>
  );
}
