import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'MAGG | Panel de Control Electoral',
  description: 'Tablero de monitoreo y estadísticas internas de registros electorales. Información no oficial.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
