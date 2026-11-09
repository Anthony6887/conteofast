'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BASE_PATH } from '../../lib/electoral';
import type { DashboardDatos, Dignidad } from '../../lib/electoral';
import { normalizarDashboard } from '../../lib/dashboard-normalizar';
import type { DatosRecintos, RespuestaRecintos } from '../../lib/recintos-estado';
import VisualizacionVotos from './visualizacion-votos';
import ResumenElectoral from './resumen-electoral';
import RecintosJuntas from './recintos-juntas';
import './dashboard-simple.css';

type Vista = 'vivo' | 'resumen' | 'recintos';
const REFRESCO_MS = 1000;
const TIEMPO_ESPERA_MS = 8000;

function Icono({ nombre }: { nombre: 'grafico' | 'resumen' | 'recintos' | 'menu' | 'cerrar' | 'actualizar' }) {
  const elementos = {
    grafico: <path d="M4 20V12M10 20V5M16 20v-8M22 20V3" />,
    resumen: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></>,
    recintos: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h3M14 8h3M7 12h3M14 12h3M7 16h3M14 16h3"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    cerrar: <path d="M5 5l14 14M19 5L5 19" />,
    actualizar: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 10a7 7 0 0 1 12-2l2 4M4 12l2 4a7 7 0 0 0 12-2"/></>
  };
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {elementos[nombre]}
    </svg>
  );
}

export default function Dashboard({ vista = 'vivo' }: { vista?: Vista }) {
  const [datos, setDatos] = useState<DashboardDatos | null>(null);
  const [recintos, setRecintos] = useState<DatosRecintos | null>(null);
  const [error, setError] = useState('');
  const [errorRecintos, setErrorRecintos] = useState('');
  const [cargando, setCargando] = useState(true);
  const [cargandoRecintos, setCargandoRecintos] = useState(true);
  const [dignidad, setDignidad] = useState<Dignidad>('ALCALDE');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [ultimaConsulta, setUltimaConsulta] = useState<Date | null>(null);
  const refrescarRef = useRef<() => void>(() => {});

  useEffect(() => {
    let activo = true;
    let ocupadaDashboard = false;
    let ocupadaRecintos = false;
    let siguienteIntentoRecintos = 0;
    let siguienteIntentoDashboard = 0;
    let ultimaConsultaRecintos = 0;
    const controladores = new Set<AbortController>();

    async function obtenerDashboard(forzar = false) {
      if (!activo || ocupadaDashboard || (!forzar && Date.now() < siguienteIntentoDashboard)) return;
      ocupadaDashboard = true;
      const controlador = new AbortController();
      controladores.add(controlador);
      const tiempo = window.setTimeout(() => controlador.abort(), TIEMPO_ESPERA_MS);
      try {
        const respuesta = await fetch(`${BASE_PATH}/api/dashboard`, {
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
          signal: controlador.signal
        });
        const json: unknown = await respuesta.json().catch(() => null);
        if (!respuesta.ok) {
          const mensaje = json && typeof json === 'object' && 'message' in json
            ? String(json.message) : `Error HTTP ${respuesta.status} al consultar votos.`;
          throw new Error(mensaje);
        }
        const datosNormalizados = normalizarDashboard(json);
        siguienteIntentoDashboard = 0;
        if (activo) {
          setDatos(datosNormalizados);
          setUltimaConsulta(new Date());
          setError('');
        }
      } catch (e) {
        siguienteIntentoDashboard = Date.now() + 5000;
        if (activo) setError(e instanceof Error ? e.message : 'No hay conexión con la API electoral.');
      } finally {
        window.clearTimeout(tiempo);
        controladores.delete(controlador);
        ocupadaDashboard = false;
        if (activo) setCargando(false);
      }
    }

    async function obtenerRecintos(forzar = false) {
      if (!activo || ocupadaRecintos || (!forzar && Date.now() < siguienteIntentoRecintos)) return;
      ocupadaRecintos = true;
      const controlador = new AbortController();
      controladores.add(controlador);
      const tiempo = window.setTimeout(() => controlador.abort(), TIEMPO_ESPERA_MS);
      try {
        const respuesta = await fetch(`${BASE_PATH}/api/recintos-estado`, {
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
          signal: controlador.signal
        });
        const json = (await respuesta.json().catch(() => null)) as RespuestaRecintos | null;
        if (!respuesta.ok || !json?.ok || !json.data || !Array.isArray(json.data.recintos)) {
          throw new Error(json?.message || `Error HTTP ${respuesta.status} al consultar recintos.`);
        }
        if (activo) {
          setRecintos(json.data);
          setErrorRecintos('');
        }
        siguienteIntentoRecintos = 0;
        ultimaConsultaRecintos = Date.now();
      } catch (e) {
        // Retraso después del error para evitar repetir 404/503 cada segundo.
        siguienteIntentoRecintos = Date.now() + 15000;
        if (activo) setErrorRecintos(e instanceof Error ? e.message : 'Error consultando recintos.');
      } finally {
        window.clearTimeout(tiempo);
        controladores.delete(controlador);
        ocupadaRecintos = false;
        if (activo) setCargandoRecintos(false);
      }
    }

    refrescarRef.current = () => {
      void obtenerDashboard(true);
      void obtenerRecintos(true);
    };
    const iniciar = window.setTimeout(() => {
      void obtenerDashboard();
      void obtenerRecintos();
    }, 0);
    const intervalo = window.setInterval(() => {
      if (!document.hidden) {
        void obtenerDashboard();
        // Solo el módulo de recintos consulta cada segundo; en otros módulos
        // un estado resumido cada 10 s evita cientos de consultas innecesarias.
        if (vista === 'recintos' || Date.now() - ultimaConsultaRecintos >= 10000) {
          void obtenerRecintos();
        }
      }
    }, REFRESCO_MS);
    const alVolver = () => {
      if (!document.hidden) {
        void obtenerDashboard();
        void obtenerRecintos();
      }
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      activo = false;
      window.clearTimeout(iniciar);
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
      controladores.forEach(c => c.abort());
      refrescarRef.current = () => {};
    };
  }, [vista]);

  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAbierto(false); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, []);

  const actualizar = useCallback(() => refrescarRef.current(), []);
  const conectado = Boolean(datos && !error);
  const pendientes = (recintos?.recintos || []).filter(r => r.pendientes > 0);
  const hora = ultimaConsulta
    ? ultimaConsulta.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  return (
    <div className={`dashboard-layout ev-layout ev-layout--${vista}`}>
      {/* Zona sensible: el sidebar aparece al acercar el puntero al borde izquierdo. */}
      <div className="ev-borde-sensible" onMouseEnter={() => setMenuAbierto(true)} aria-hidden="true" />
      <button type="button" className="ev-abrir-menu" aria-label="Abrir menú de navegación"
        aria-expanded={menuAbierto} onClick={() => setMenuAbierto(v => !v)}>
        <Icono nombre="menu" />
      </button>

      {menuAbierto && <div className="ev-menu-fondo" onClick={() => setMenuAbierto(false)} aria-hidden="true" />}
      <aside className={`sidebar ev-sidebar ${menuAbierto ? 'ev-sidebar--abierto' : ''}`}
        aria-label="Navegación de ConteoFast" onMouseLeave={() => setMenuAbierto(false)}>
        <div className="sidebar-marca ev-marca">
          <span className="marca-logo"><Icono nombre="grafico" /></span>
          <div><strong>MAGG</strong><span>CONTROL ELECTORAL</span></div>
          <button type="button" className="ev-cerrar-menu" aria-label="Ocultar menú"
            onClick={() => setMenuAbierto(false)}><Icono nombre="cerrar" /></button>
        </div>
        <nav className="ev-menu" aria-label="Menú principal">
          <Link href="/" onClick={() => setMenuAbierto(false)}
            className={`ev-menu-link ${vista === 'vivo' ? 'ev-menu-link--activo' : ''}`}
            aria-current={vista === 'vivo' ? 'page' : undefined}>
            <Icono nombre="grafico"/><span>Visualización en vivo</span>
          </Link>
          <Link href="/resumen" onClick={() => setMenuAbierto(false)}
            className={`ev-menu-link ${vista === 'resumen' ? 'ev-menu-link--activo' : ''}`}
            aria-current={vista === 'resumen' ? 'page' : undefined}>
            <Icono nombre="resumen"/><span>Resumen electoral</span>
          </Link>
          <Link href="/recintos" onClick={() => setMenuAbierto(false)}
            className={`ev-menu-link ${vista === 'recintos' ? 'ev-menu-link--activo' : ''}`}
            aria-current={vista === 'recintos' ? 'page' : undefined}>
            <Icono nombre="recintos"/><span>Recintos y juntas</span>
          </Link>
        </nav>
        <div className="ev-pendientes-lateral">
        </div>
        <div className="ev-sidebar-pie">
          <span className={`ev-luz ${conectado ? 'ev-luz--ok' : error ? 'ev-luz--error' : ''}`} />
          {conectado ? 'API conectada' : error ? 'Conexión interrumpida' : 'Conectando…'}
          <small>Última lectura: {hora} · No oficial</small>
          <small>F11: pantalla completa del navegador</small>
        </div>
      </aside>

      <div className="contenido ev-contenido">
        <main className="main ev-main">
          {error && <div className="ev-error" role="alert">{error}{datos ? ' Se conserva la última lectura válida.' : ''}</div>}
          {cargando && !datos && !error && <div className="ev-cargando" role="status">Consultando votos de ConteoFast…</div>}
          {!datos && error && <button type="button" className="ev-reintentar" onClick={actualizar}>Reintentar consulta</button>}
          {vista === 'recintos'
            ? <RecintosJuntas datos={recintos} error={errorRecintos} cargando={cargandoRecintos} onActualizar={actualizar} />
            : datos && (vista === 'vivo'
              ? <VisualizacionVotos candidatos={datos.candidatos} dignidad={dignidad} onCambiarDignidad={setDignidad} />
              : <ResumenElectoral datos={datos} />)}
          {vista !== 'vivo' && <footer className="ev-footer-pie">
            MAGG · Elecciones 2026
          </footer>}
        </main>
      </div>
    </div>
  );
}
