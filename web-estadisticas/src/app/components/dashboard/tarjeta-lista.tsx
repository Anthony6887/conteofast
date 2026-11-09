import Image from 'next/image';
import type { CSSProperties } from 'react';
import { BASE_PATH, numero, obtenerCandidato } from '../../lib/electoral';
import type { CandidatoResultado, Dignidad, ListaReferente, PersonaLista } from '../../lib/electoral';

interface Props {
  lista: ListaReferente;
  candidatos: CandidatoResultado[];
}

function CandidatoMini({ lista, persona, candidatos, dignidad }: {
  lista: ListaReferente;
  persona: PersonaLista;
  candidatos: CandidatoResultado[];
  dignidad: Dignidad;
}) {
  const candidato = obtenerCandidato(candidatos, lista, dignidad);
  return (
    <div className="concejal-fila">
      <Image className="avatar avatar-mini" width={43} height={43}
        src={`${BASE_PATH}/candidatos/${persona.foto}`}
        alt={`Fotografía de ${persona.nombre}`} unoptimized />
      <div className="concejal-info">
        <span className="concejal-dignidad">{dignidad === 'URBANO' ? 'Concejal urbano' : 'Concejal rural'}</span>
        <strong>{candidato?.nombre ?? persona.nombre}</strong>
      </div>
      <div className="concejal-votos"><strong>{candidato ? numero(candidato.total_votos) : '—'}</strong><span>votos</span></div>
    </div>
  );
}

export function TarjetaLista({ lista, candidatos }: Props) {
  const alcalde = obtenerCandidato(candidatos, lista, 'ALCALDE');
  return (
    <article className="tarjeta-lista" style={{ '--color-lista': lista.color } as CSSProperties}>
      <div className="tarjeta-lista-superior">
        <span className="etiqueta-lista">LISTA {lista.numero}</span>
        <span className="punto-lista" aria-hidden="true" />
      </div>
      <div className="alcalde-perfil">
        <Image className="avatar avatar-xl" width={88} height={88}
          src={`${BASE_PATH}/candidatos/${lista.alcalde.foto}`}
          alt={`Fotografía de ${lista.alcalde.nombre}`} unoptimized />
        <div>
          <span className="rol-titulo">Candidato a alcalde</span>
          <h3>{alcalde?.nombre ?? lista.alcalde.nombre}</h3>
          <div className="alcalde-votos"><strong>{alcalde ? numero(alcalde.total_votos) : '—'}</strong><span>votos registrados</span></div>
        </div>
      </div>
      <div className="tarjeta-separador" />
      <CandidatoMini lista={lista} persona={lista.urbano} candidatos={candidatos} dignidad="URBANO" />
      <CandidatoMini lista={lista} persona={lista.rural} candidatos={candidatos} dignidad="RURAL" />
    </article>
  );
}
