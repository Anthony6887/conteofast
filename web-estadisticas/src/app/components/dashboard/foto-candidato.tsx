'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BASE_PATH } from '../../lib/electoral';

type Props = { nombre: string; archivo: string | null; size?: number; className?: string };

export function FotoCandidato({ nombre, archivo, size = 72, className = '' }: Props) {
  const [fallo, setFallo] = useState<string | null>(null);
  const iniciales = nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] ?? '').join('').toUpperCase();

  if (!archivo || fallo === archivo) {
    return <span className={`tc-foto-fallback ${className}`}
      style={{ width: size, height: size }} role="img"
      aria-label={`Sin fotografía de ${nombre}`} title={`Foto no disponible: ${nombre}`}>
      {iniciales || '?'}
    </span>;
  }

  return <Image
    src={`${BASE_PATH}/candidatos/${archivo}`}
    alt={`Fotografía de ${nombre}`}
    width={size} height={size} className={className}
    unoptimized onError={() => setFallo(archivo)}
  />;
}
