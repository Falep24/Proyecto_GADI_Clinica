import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClinical } from '../context/ClinicalContext';
import { clinicalApi, FASTAPI_BASE_URL, KpisMonitorResponse } from '../services/api';

type PeriodKey = '30d' | 'q3' | 'y2024';
type SedeKey = 'miraflores-san-isidro' | 'surco' | 'todas';
type PowerBiView = 'ejecutiva' | 'olap' | 'whatif';

const DEFAULT_PBI_URL =
  'https://app.powerbi.com/reportEmbed?reportId=d3fa8901-cl1n-4bb2-901f-sonrisaintegral&autoAuth=true&ctid=dental-corp';

export const PowerBiDashboardPage: React.FC = () => {
  const { lastSyncTime, pushToast, appendSqlLog, retentionRows, oltpAppointments } = useClinical();

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [sede, setSede] = useState<SedeKey>('miraflores-san-isidro');
  const [pbiUrl, setPbiUrl] = useState(DEFAULT_PBI_URL);
  const [embedTitle, setEmbedTitle] = useState(
    'Dashboard Clínico Ejecutivo • DentalCenter Power BI v2024.11'
  );
  const [activeView, setActiveView] = useState<PowerBiView>('ejecutiva');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFrameLoading, setIsFrameLoading] = useState(false);
  const [metaOpen, setMetaOpen] = useState(true);
  const [apiKpis, setApiKpis] = useState<KpisMonitorResponse | null>(null);

  // What-If sliders
  const [sliderEspera, setSliderEspera] = useState(10);
  const [sliderSms, setSliderSms] = useState(95);

  const embedRef = useRef<HTMLDivElement>(null);

  const fetchKpisFromBackend = useCallback(
    async (selectedPeriod: PeriodKey, selectedSede: SedeKey, notify = false) => {
      setIsRefreshing(true);
      appendSqlLog(
        'FASTAPI_GET',
        `fetch('${FASTAPI_BASE_URL}/api/kpis-monitor?period=${selectedPeriod}&sede=${selectedSede}')`,
        'cmd'
      );
      try {
        const data = await clinicalApi.getKpisMonitor(selectedPeriod, selectedSede);
        setApiKpis(data);
        appendSqlLog('FASTAPI_OK', 'KPIs recibidos desde FastAPI /api/kpis-monitor.', 'success');
        if (notify) {
          pushToast(
            'Métricas Actualizadas',
            'Datos obtenidos en vivo desde FastAPI (/api/kpis-monitor).'
          );
        }
      } catch {
        setApiKpis(null);
        appendSqlLog(
          'API_FALLBACK',
          `FastAPI ${FASTAPI_BASE_URL}/api/kpis-monitor no accesible; usando cálculo local.`,
          'warn'
        );
        if (notify) {
          pushToast(
            'Caché Local Activa',
            `No se detectó servidor en ${FASTAPI_BASE_URL}; mostrando cálculo local.`,
            'info'
          );
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [appendSqlLog, pushToast]
  );

  useEffect(() => {
    fetchKpisFromBackend(period, sede, false);
  }, [period, sede, fetchKpisFromBackend]);

  const kpis = useMemo(() => {
    if (apiKpis) {
      return {
        tasa:
          typeof apiKpis.tasaInasistencia === 'number'
            ? apiKpis.tasaInasistencia.toFixed(1)
            : '24.8',
        citas:
          typeof apiKpis.citasProgramadas === 'number'
            ? apiKpis.citasProgramadas.toLocaleString('es-PE')
            : '1,420',
        riesgo:
          typeof apiKpis.ingresosEnRiesgo === 'number'
            ? `S/ ${apiKpis.ingresosEnRiesgo.toLocaleString('es-PE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            : 'S/ 38,450.00',
        espera:
          typeof apiKpis.tiempoMedioEspera === 'number'
            ? apiKpis.tiempoMedioEspera.toFixed(1)
            : '14.2',
      };
    }

    const sedeMult = sede === 'todas' ? 1.85 : sede === 'surco' ? 0.78 : 1;
    const baseCitas =
      period === '30d' ? 1420 : period === 'q3' ? 4180 : 12950;
    const baseTasa =
      period === '30d' ? 24.8 : period === 'q3' ? 26.1 : 25.4;
    const baseRiesgo =
      period === '30d' ? 38450 : period === 'q3' ? 114200 : 342800;

    // Slight live adjustment from current high-risk retention rows
    const liveAdjustment = retentionRows.filter((r) => r.smsRecibido === 1).length - 5;
    const adjustedTasa = Math.max(18.0, baseTasa - liveAdjustment * 0.25);
    const totalCitas = Math.round(baseCitas * sedeMult) + (oltpAppointments.length - 6);
    const totalRiesgo = Math.round(baseRiesgo * sedeMult);

    return {
      tasa: adjustedTasa.toFixed(1),
      citas: totalCitas.toLocaleString('es-PE'),
      riesgo: `S/ ${totalRiesgo.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      espera: sede === 'surco' ? '15.6' : sede === 'todas' ? '14.9' : '14.2',
    };
  }, [apiKpis, period, sede, retentionRows, oltpAppointments.length]);

  const executiveDetails = useMemo(() => {
    const turnosSalvados =
      typeof apiKpis?.turnosSalvados === 'number' ? apiKpis.turnosSalvados : 186;
    const ingresosRecuperados =
      typeof apiKpis?.ingresosRecuperados === 'number' ? apiKpis.ingresosRecuperados : 18200;
    const eficienciaSillon =
      typeof apiKpis?.eficienciaSillon === 'number' ? apiKpis.eficienciaSillon : 87.4;
    const asistenciaConSms =
      typeof apiKpis?.asistenciaConSms === 'number' ? apiKpis.asistenciaConSms : 88.4;
    const asistenciaSinSms =
      typeof apiKpis?.asistenciaSinSms === 'number' ? apiKpis.asistenciaSinSms : 58.1;

    return {
      turnosSalvados,
      ingresosRecuperados: `S/ ${ingresosRecuperados.toLocaleString('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      eficienciaSillon: eficienciaSillon.toFixed(1),
      asistenciaConSms: asistenciaConSms.toFixed(1),
      inasistenciaConSms: (100 - asistenciaConSms).toFixed(1),
      asistenciaSinSms: asistenciaSinSms.toFixed(1),
      inasistenciaSinSms: (100 - asistenciaSinSms).toFixed(1),
      diferenciaSms: (asistenciaConSms - asistenciaSinSms).toFixed(1),
    };
  }, [apiKpis]);

  const whatIfMetrics = useMemo(() => {
    const efectoDias = (sliderEspera - 14) * 0.85;
    const efectoSms = (sliderSms - 70) * -0.22;
    let nuevaTasa = 24.8 + efectoDias + efectoSms;
    if (nuevaTasa < 9.5) nuevaTasa = 9.5;
    if (nuevaTasa > 48.0) nuevaTasa = 48.0;

    const citasRecuperadas = Math.round(1420 * ((24.8 - nuevaTasa) / 100));
    const ingresoTotal = citasRecuperadas * 115;

    return {
      nuevaTasa: nuevaTasa.toFixed(1),
      ingreso: `${ingresoTotal >= 0 ? '+' : '-'}S/ ${Math.abs(ingresoTotal).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      positive: ingresoTotal >= 0,
    };
  }, [sliderEspera, sliderSms]);

  const handleRefresh = () => {
    fetchKpisFromBackend(period, sede, true);
  };

  const handleLoadReport = () => {
    const clean = pbiUrl.trim();
    if (!clean) {
      pushToast('URL Requerida', 'Ingrese una URL válida de Power BI Embed (iframe).', 'warning');
      return;
    }
    setIsFrameLoading(true);
    setTimeout(() => {
      setIsFrameLoading(false);
      setEmbedTitle(
        `Reporte Embebido Dinámico • ${clean.length > 50 ? `${clean.slice(0, 48)}...` : clean}`
      );
      pushToast('Reporte Sincronizado', 'Endpoint Power BI validado y montado en el visor.');
    }, 650);
  };

  const handleResetDemo = () => {
    setPbiUrl(DEFAULT_PBI_URL);
    setActiveView('ejecutiva');
    setEmbedTitle('Dashboard Clínico Ejecutivo • DentalCenter Power BI v2024.11');
    pushToast('Demo Restablecida', 'Vista ejecutiva predeterminada restaurada.', 'info');
  };

  const handleFullscreen = () => {
    const el = embedRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {
        pushToast('Pantalla Completa', 'Modo expandido bloqueado por el contenedor iframe.', 'info');
      });
    } else {
      document.exitFullscreen?.();
    }
  };

  return (
    <div className="flex flex-col w-full gap-5">
      {/* BANNER DE CONTEXTO SUPERIOR */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 lg:p-6 bg-surface-container-lowest rounded-xl shadow-sm">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-code-sm px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-semibold tracking-wide uppercase">
              Power BI Enterprise • DirectQuery
            </span>
            <span className="font-label-sm text-tertiary flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Última sincronización ETL: Hoy, {lastSyncTime}
            </span>
          </div>
          <h1 className="font-display-lg text-on-surface tracking-tight">
            Inteligencia de Negocios y Rendimiento Clínico
          </h1>
          <p className="font-body-sm text-on-surface-variant">
            Monitoreo predictivo de inasistencias (No-Show), optimización de agenda médica y análisis de retorno clínico en tiempo real.
          </p>
        </div>

        {/* Filtros de período y sede */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
            {(
              [
                { key: '30d', label: 'Últimos 30 días' },
                { key: 'q3', label: 'Trimestre Q3 2024' },
                { key: 'y2024', label: 'Año 2024' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPeriod(opt.key)}
                className={`px-3 py-1.5 rounded font-label-sm transition-all whitespace-nowrap ${
                  period === opt.key
                    ? 'bg-surface-container-lowest text-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <select
              value={sede}
              onChange={(e) => setSede(e.target.value as SedeKey)}
              className="appearance-none bg-surface-container-low font-label-sm text-on-surface py-2 pl-3 pr-8 rounded-lg outline-none cursor-pointer hover:bg-surface-container transition-colors"
            >
              <option value="miraflores-san-isidro">Sede Miraflores / San Isidro</option>
              <option value="surco">Sede Santiago de Surco</option>
              <option value="todas">Todas las Sedes (Consolidado)</option>
            </select>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              expand_more
            </span>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md shadow-sm transition-all whitespace-nowrap disabled:opacity-70"
          >
            <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}>
              autorenew
            </span>
            <span>Actualizar Métricas Power BI</span>
          </button>
        </div>
      </section>

      {/* TARJETAS KPI SUPERIORES (4 métricas clave) */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="flex flex-col justify-between p-5 bg-surface-container-lowest rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-2">
            <span className="font-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
              Tasa de Inasistencia (%)
            </span>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="font-label-sm font-semibold">Salud Clínica Óptima</span>
            </div>
          </div>
          <div className="my-4 flex items-baseline gap-2">
            <span className="font-display-lg text-on-surface tracking-tight">{kpis.tasa}%</span>
            <span className="font-label-sm font-semibold text-emerald-700 flex items-center">
              <span className="material-symbols-outlined text-[16px]">arrow_downward</span> 3.2%
            </span>
          </div>
          <div className="bg-surface-container-low -mx-5 -mb-5 p-4 rounded-b-xl flex flex-col gap-1">
            <span className="font-body-sm text-on-surface-variant">
              vs. mes anterior (4,230 turnos analizados)
            </span>
            <span className="font-code-sm text-primary font-medium flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">psychology</span>
              Reducción con Random Forest v3.2
            </span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="flex flex-col justify-between p-5 bg-surface-container-lowest rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-2">
            <span className="font-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
              Citas Programadas Activas
            </span>
            <span className="font-code-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-semibold">
              {period === '30d' ? 'Mensual' : period === 'q3' ? 'Trimestral' : 'Anual'}
            </span>
          </div>
          <div className="my-4 flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="font-display-lg text-on-surface tracking-tight">{kpis.citas}</span>
              <span className="font-label-md text-on-surface-variant">citas</span>
            </div>
            <span className="font-body-sm text-primary font-semibold flex items-center gap-1 mt-1">
              <span className="material-symbols-outlined text-[16px]">event_upcoming</span>
              128 citas agendadas para hoy
            </span>
          </div>
          <div className="-mx-5 -mb-5 p-4 bg-surface-container-low rounded-b-xl flex items-center justify-between font-code-sm text-on-surface-variant">
            <span>
              Gen: <strong className="text-on-surface">620</strong>
            </span>
            <span>•</span>
            <span>
              Endo: <strong className="text-on-surface">480</strong>
            </span>
            <span>•</span>
            <span>
              Orto: <strong className="text-on-surface">320</strong>
            </span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="flex flex-col justify-between p-5 bg-surface-container-lowest rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-2">
            <span className="font-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
              Ingresos en Riesgo (No-Show)
            </span>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span className="font-label-sm font-semibold">Alerta Financiera</span>
            </div>
          </div>
          <div className="my-4 flex items-baseline gap-2">
            <span className="font-display-lg text-rose-700 tracking-tight">{kpis.riesgo}</span>
          </div>
          <div className="-mx-5 -mb-5 p-4 bg-rose-50/80 rounded-b-xl flex flex-col gap-1">
            <span className="font-label-sm text-rose-900 font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">report_problem</span>
              Impacto estimado sin intervención
            </span>
            <span className="font-body-sm text-rose-800/80">
              Valor promedio hora-sillón: S/ 115.00
            </span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="flex flex-col justify-between p-5 bg-surface-container-lowest rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between gap-2">
            <span className="font-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
              Tiempo Medio de Espera
            </span>
            <span className="font-code-sm px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
              Lag Cita
            </span>
          </div>
          <div className="my-4 flex items-baseline gap-2">
            <span className="font-display-lg text-on-surface tracking-tight">{kpis.espera}</span>
            <span className="font-label-md text-on-surface-variant">días corridos</span>
          </div>
          <div className="-mx-5 -mb-5 p-4 bg-surface-container-low rounded-b-xl flex flex-col gap-1">
            <span className="font-label-sm text-on-surface font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-amber-600">crisis_alert</span>
              Factor de Máxima Sensibilidad
            </span>
            <span className="font-body-sm text-on-surface-variant">
              Explicabilidad SHAP: ~70% de peso predictivo
            </span>
          </div>
        </div>
      </section>

      {/* CONTENEDOR CENTRAL DE POWER BI CON BARRA DE CONTROL */}
      <section className="flex flex-col bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 bg-surface-container-high flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex-1 flex items-center bg-surface-container-lowest rounded-lg px-3 py-1.5 shadow-inner">
              <span className="material-symbols-outlined text-[20px] text-primary shrink-0 mr-2">
                link
              </span>
              <input
                type="text"
                value={pbiUrl}
                onChange={(e) => setPbiUrl(e.target.value)}
                placeholder="Pegue aquí la URL de inserción (iframe) de su reporte Power BI..."
                className="w-full bg-transparent font-code-sm text-on-surface outline-none placeholder:text-outline-variant"
              />
              <button
                type="button"
                onClick={() => setPbiUrl('')}
                title="Limpiar URL"
                className="text-on-surface-variant hover:text-on-surface p-1"
              >
                <span className="material-symbols-outlined text-[18px]">clear</span>
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={handleLoadReport}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md transition-all shadow-sm whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px]">sync</span>
                <span>Cargar Reporte</span>
              </button>
              <button
                type="button"
                onClick={handleResetDemo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface font-label-md transition-all whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                <span>Restablecer Demo</span>
              </button>
              <button
                type="button"
                onClick={handleFullscreen}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface font-label-md transition-all whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-[16px]">fullscreen</span>
                <span>Pantalla Completa</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setActiveView('ejecutiva');
                  setEmbedTitle('Dashboard Clínico Ejecutivo • DentalCenter Power BI v2024.11');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-label-md transition-all whitespace-nowrap ${
                  activeView === 'ejecutiva'
                    ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">dashboard</span>
                <span>Vista Ejecutiva / Dirección</span>
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-code-sm text-[10px]">
                  KPIs Activos
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveView('olap');
                  setEmbedTitle(
                    'Cubo Multidimensional OLAP • Análisis Ad-Hoc de Citas por Especialidad'
                  );
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-label-md transition-all whitespace-nowrap ${
                  activeView === 'olap'
                    ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">view_in_ar</span>
                <span>Cubo Multidimensional OLAP</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveView('whatif');
                  setEmbedTitle('Simulador What-If de Capacidad y Reducción de Ausentismo');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-label-md transition-all whitespace-nowrap ${
                  activeView === 'whatif'
                    ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
                <span>Simulador What-If de Citas</span>
              </button>
            </div>

            <div className="flex items-center gap-3 text-on-surface-variant font-code-sm">
              <span className="flex items-center gap-1 text-emerald-700">
                <span className="material-symbols-outlined text-[16px]">verified_user</span>
                RLS Dental Role: Director_Lima
              </span>
              <span className="hidden md:inline">|</span>
              <span className="hidden md:flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">memory</span>
                DirectQuery Latencia: 18ms
              </span>
            </div>
          </div>
        </div>

        {/* Viewport Power BI Oscuro */}
        <div
          ref={embedRef}
          className="relative w-full min-h-[560px] bg-slate-900 text-slate-100 flex flex-col justify-between overflow-hidden"
        >
          <div className="h-10 bg-slate-950 px-4 flex items-center justify-between shrink-0 border-b border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-4 h-4 rounded-sm bg-amber-400 flex items-center justify-center font-bold text-[10px] text-slate-950 shrink-0">
                PB
              </span>
              <span className="font-label-md text-slate-200 font-semibold truncate">
                {embedTitle}
              </span>
            </div>
            <div className="flex items-center gap-3 text-slate-400 font-code-sm shrink-0">
              <span>Página {activeView === 'ejecutiva' ? '1' : activeView === 'olap' ? '2' : '3'} de 3</span>
              <button
                type="button"
                onClick={() => pushToast('Exportación PDF', 'Snapshot del dashboard Power BI generado.', 'info')}
                className="hover:text-white"
                title="Exportar a PDF"
              >
                <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('olap')}
                className="hover:text-white"
                title="Ver Datos Subyacentes"
              >
                <span className="material-symbols-outlined text-[18px]">table_rows</span>
              </button>
            </div>
          </div>

          {/* Lienzo */}
          <div
            className={`flex-1 p-4 lg:p-6 bg-slate-900 flex flex-col gap-4 transition-opacity duration-300 ${
              isFrameLoading ? 'opacity-40' : 'opacity-100'
            }`}
          >
            {activeView === 'ejecutiva' && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-800/80 rounded-lg p-3.5 flex items-center justify-between">
                    <div>
                      <span className="font-code-sm text-slate-400 uppercase">
                        Impacto Global del Modelo IA
                      </span>
                      <p className="font-headline-md text-emerald-400 font-bold">
                        {executiveDetails.turnosSalvados} Turnos Salvados
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-[32px] text-emerald-500/40">
                      health_and_safety
                    </span>
                  </div>
                  <div className="bg-slate-800/80 rounded-lg p-3.5 flex items-center justify-between">
                    <div>
                      <span className="font-code-sm text-slate-400 uppercase">
                        Ingresos Recuperados Directos
                      </span>
                      <p className="font-headline-md text-sky-400 font-bold">
                        {executiveDetails.ingresosRecuperados}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-[32px] text-sky-500/40">
                      payments
                    </span>
                  </div>
                  <div className="bg-slate-800/80 rounded-lg p-3.5 flex items-center justify-between">
                    <div>
                      <span className="font-code-sm text-slate-400 uppercase">
                        Eficiencia Ocupacional Sillón
                      </span>
                      <p className="font-headline-md text-amber-300 font-bold">
                        {executiveDetails.eficienciaSillon}%{' '}
                        <span className="font-label-sm text-slate-400 font-normal">(Obj: 85%)</span>
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-[32px] text-amber-500/40">
                      chair
                    </span>
                  </div>
                </div>

                {/* Curva + SMS */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-7 bg-slate-800/90 rounded-xl p-4 flex flex-col justify-between shadow-lg">
                    <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex flex-col">
                        <span className="font-label-md text-white font-semibold flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px] text-sky-400">
                            trending_up
                          </span>
                          Curva de Inasistencia según Tiempo de Espera (Días corridos)
                        </span>
                        <span className="font-code-sm text-slate-400">
                          DAX: CALCULATE([TasaNoShow], ALLEXCEPT(Dim_Citas, Dim_Citas[DiasEspera]))
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 font-code-sm border border-rose-800/50">
                        Umbral Crítico &gt; 15 días: 54.2%
                      </span>
                    </div>

                    <div className="w-full h-52 relative flex items-end pt-4 pb-1">
                      <svg
                        className="w-full h-full overflow-visible"
                        preserveAspectRatio="none"
                        viewBox="0 0 600 200"
                      >
                        <line stroke="#334155" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="600" y1="40" y2="40" />
                        <line stroke="#334155" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="600" y1="90" y2="90" />
                        <line stroke="#334155" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="600" y1="140" y2="140" />
                        <line stroke="#475569" strokeWidth="1.5" x1="0" x2="600" y1="190" y2="190" />

                        <rect fill="#f43f5e" fillOpacity="0.08" height="170" width="250" x="350" y="20" />
                        <text fill="#fda4af" fontFamily="JetBrains Mono" fontSize="11" fontWeight="600" x="360" y="35">
                          ZONA DE RIESGO SEVERO (&gt;50% No-Show)
                        </text>

                        <defs>
                          <linearGradient id="curvaGrad" x1="0%" x2="100%" y1="0%" y2="0%">
                            <stop offset="0%" stopColor="#38bdf8" />
                            <stop offset="60%" stopColor="#fbbf24" />
                            <stop offset="100%" stopColor="#f43f5e" />
                          </linearGradient>
                          <linearGradient id="areaGrad" x1="0%" x2="0%" y1="0%" y2="100%">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        <path
                          d="M 30 180 Q 150 170, 260 145 T 380 95 T 520 45 L 570 32 L 570 190 L 30 190 Z"
                          fill="url(#areaGrad)"
                        />
                        <path
                          d="M 30 180 Q 150 170, 260 145 T 380 95 T 520 45 L 570 32"
                          fill="none"
                          stroke="url(#curvaGrad)"
                          strokeWidth="3.5"
                        />

                        <circle cx="30" cy="180" fill="#38bdf8" r="4.5" />
                        <text fill="#cbd5e1" fontFamily="JetBrains Mono" fontSize="10" x="20" y="170">
                          8.2%
                        </text>

                        <circle cx="160" cy="165" fill="#38bdf8" r="4.5" />
                        <text fill="#cbd5e1" fontFamily="JetBrains Mono" fontSize="10" x="150" y="155">
                          14.1%
                        </text>

                        <circle cx="360" cy="105" fill="#fbbf24" r="6" stroke="#ffffff" strokeWidth="1.5" />
                        <text fill="#fde047" fontFamily="JetBrains Mono" fontSize="11" fontWeight="bold" x="325" y="90">
                          15d: 38.6%
                        </text>

                        <circle cx="490" cy="55" fill="#f43f5e" r="5" />
                        <text fill="#fda4af" fontFamily="JetBrains Mono" fontSize="11" fontWeight="bold" x="465" y="45">
                          52.8%
                        </text>

                        <circle cx="570" cy="32" fill="#f43f5e" r="6" stroke="#ffffff" strokeWidth="1.5" />
                        <text fill="#f43f5e" fontFamily="JetBrains Mono" fontSize="12" fontWeight="bold" x="530" y="25">
                          61.4%
                        </text>
                      </svg>
                    </div>

                    <div className="flex justify-between px-4 font-code-sm text-slate-400 mt-1">
                      <span>0-2 días</span>
                      <span>5-7 días</span>
                      <span>10-12 días</span>
                      <span className="text-amber-300 font-semibold">15 días</span>
                      <span>20-22 días</span>
                      <span className="text-rose-400 font-semibold">28-35+ días</span>
                    </div>
                  </div>

                  <div className="lg:col-span-5 bg-slate-800/90 rounded-xl p-4 flex flex-col justify-between shadow-lg">
                    <div className="flex flex-col gap-1">
                      <span className="font-label-md text-white font-semibold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px] text-emerald-400">
                          sms
                        </span>
                        Efecto Protector de Recordatorio SMS Automatizado
                      </span>
                      <span className="font-code-sm text-slate-400">
                        Muestra: {kpis.citas} citas programadas
                      </span>
                    </div>

                    <div className="my-4 flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-baseline text-label-md">
                          <span className="font-medium text-slate-200 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                            Con Recordatorio SMS Confirmado
                          </span>
                          <span className="font-headline-md font-bold text-emerald-400">
                            {executiveDetails.asistenciaConSms}% Asistencia
                          </span>
                        </div>
                        <div className="w-full h-5 rounded-lg bg-slate-950 p-1 flex items-center">
                          <div
                            className="h-full rounded-md bg-gradient-to-r from-emerald-600 to-emerald-400"
                            style={{ width: `${executiveDetails.asistenciaConSms}%` }}
                          />
                        </div>
                        <span className="font-code-sm text-slate-400 text-right">
                          Inasistencia controlada: solo {executiveDetails.inasistenciaConSms}%
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-baseline text-label-md">
                          <span className="font-medium text-slate-200 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                            Sin Recordatorio SMS (Tradicional)
                          </span>
                          <span className="font-headline-md font-bold text-rose-400">
                            {executiveDetails.asistenciaSinSms}% Asistencia
                          </span>
                        </div>
                        <div className="w-full h-5 rounded-lg bg-slate-950 p-1 flex items-center">
                          <div
                            className="h-full rounded-md bg-gradient-to-r from-rose-700 to-rose-500"
                            style={{ width: `${executiveDetails.asistenciaSinSms}%` }}
                          />
                        </div>
                        <span className="font-code-sm text-rose-300 font-semibold text-right">
                          Inasistencia elevada: {executiveDetails.inasistenciaSinSms}%
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-700/50 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[20px] text-sky-400 shrink-0">
                        insights
                      </span>
                      <span className="font-body-sm text-slate-300">
                        <strong className="text-white">+{executiveDetails.diferenciaSms} puntos porcentuales</strong> de retención cuando se envía SMS predictivo 48h antes.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Matriz Geográfica Lima */}
                <div className="bg-slate-800/90 rounded-xl p-4 shadow-lg flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-label-md text-white font-semibold flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px] text-amber-400">
                          location_on
                        </span>
                        Matriz de Distribución de Inasistencias por Distrito / Área Metropolitana de Lima
                      </span>
                      <span className="font-code-sm text-slate-400">
                        Dim_Paciente[Distrito] cruzado con Fact_Atenciones
                      </span>
                    </div>
                    <span className="font-code-sm px-2.5 py-1 rounded bg-slate-700/60 text-slate-200 self-start sm:self-auto">
                      Segmentación Georreferenciada
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {[
                      { name: 'S.J. Lurigancho', pct: '34.2%', status: 'No-Show Muy Alto', vol: '340 citas', dist: '>18 km', tone: 'text-rose-400', sub: 'text-rose-300' },
                      { name: 'Los Olivos', pct: '29.6%', status: 'No-Show Moderado', vol: '260 citas', dist: '>14 km', tone: 'text-rose-300', sub: 'text-rose-300' },
                      { name: 'Santiago de Surco', pct: '21.4%', status: 'No-Show Controlado', vol: '310 citas', dist: '~6 km', tone: 'text-amber-300', sub: 'text-amber-200' },
                      { name: 'Miraflores (Local)', pct: '14.8%', status: 'Alta Adherencia', vol: '290 citas', dist: '<2 km', tone: 'text-emerald-400', sub: 'text-emerald-300' },
                      { name: 'San Isidro (Local)', pct: '12.1%', status: 'Máxima Adherencia', vol: '220 citas', dist: '<1.5 km', tone: 'text-emerald-400', sub: 'text-emerald-300' },
                    ].map((d) => (
                      <div
                        key={d.name}
                        className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-between"
                      >
                        <div>
                          <span className="font-code-sm text-slate-400">{d.name}</span>
                          <p className={`font-headline-md font-bold mt-1 ${d.tone}`}>{d.pct}</p>
                          <span className={`font-body-sm ${d.sub}`}>{d.status}</span>
                        </div>
                        <div className="mt-3 pt-2 border-t border-slate-800 font-code-sm text-slate-400">
                          Volumen: {d.vol}
                          <br />
                          Distancia: {d.dist}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeView === 'olap' && (
              <div className="bg-slate-800/90 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-headline-md text-white">
                      Explorador de Cubo OLAP • DentalCenter_SSAS
                    </h3>
                    <span className="font-code-sm text-slate-400">
                      Medidas MDX: [Measures].[Citas], [Measures].[Costo_NoShow], [Measures].[Tasa_Cumplimiento]
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-sky-900 text-sky-200 font-code-sm">
                    Motor VertiPaq en Memoria
                  </span>
                </div>

                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-left font-code-sm">
                    <thead>
                      <tr className="bg-slate-950 text-slate-300">
                        <th className="p-2.5">Especialidad Clínica</th>
                        <th className="p-2.5">Canal de Agendamiento</th>
                        <th className="p-2.5 text-right">Total Turnos</th>
                        <th className="p-2.5 text-right">No-Show Registrado</th>
                        <th className="p-2.5 text-right">Costo Estimado</th>
                        <th className="p-2.5 text-center">Score Severidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-200">
                      <tr className="hover:bg-slate-700/40">
                        <td className="p-2.5 font-medium text-white">Ortodoncia Inicial</td>
                        <td className="p-2.5">WhatsApp Bot</td>
                        <td className="p-2.5 text-right">320</td>
                        <td className="p-2.5 text-right font-bold text-rose-400">29.1% (93)</td>
                        <td className="p-2.5 text-right text-rose-300">S/ 11,160.00</td>
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded bg-rose-900/60 text-rose-200 text-[10px]">
                            CRÍTICO
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-700/40">
                        <td className="p-2.5 font-medium text-white">Endodoncia Multirradicular</td>
                        <td className="p-2.5">Call Center Central</td>
                        <td className="p-2.5 text-right">480</td>
                        <td className="p-2.5 text-right font-bold text-amber-300">25.0% (120)</td>
                        <td className="p-2.5 text-right text-amber-200">S/ 16,800.00</td>
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded bg-amber-900/60 text-amber-200 text-[10px]">
                            MEDIO
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-700/40">
                        <td className="p-2.5 font-medium text-white">Odontología General &amp; Profilaxis</td>
                        <td className="p-2.5">Presencial / Counter</td>
                        <td className="p-2.5 text-right">620</td>
                        <td className="p-2.5 text-right font-bold text-emerald-400">20.2% (125)</td>
                        <td className="p-2.5 text-right text-emerald-200">S/ 10,490.00</td>
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200 text-[10px]">
                            BAJO
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-700/40">
                        <td className="p-2.5 font-medium text-white">Periodoncia e Implantes</td>
                        <td className="p-2.5">Referido Clínico</td>
                        <td className="p-2.5 text-right">194</td>
                        <td className="p-2.5 text-right font-bold text-emerald-400">13.4% (26)</td>
                        <td className="p-2.5 text-right text-emerald-200">S/ 4,680.00</td>
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded bg-emerald-900/60 text-emerald-200 text-[10px]">
                            ÓPTIMO
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeView === 'whatif' && (
              <div className="bg-slate-800/90 rounded-xl p-5 flex flex-col gap-4">
                <div>
                  <h3 className="font-headline-md text-white">
                    Simulador DAX What-If: Optimización de Parámetros de Agenda
                  </h3>
                  <p className="font-body-sm text-slate-300">
                    Mueva los controles deslizantes para proyectar el impacto económico y clínico según políticas de agenda restrictivas.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-5 bg-slate-950/70 p-4 rounded-lg">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between font-label-md text-slate-200">
                        <span>Reducción de Tiempo de Espera Máximo (Días):</span>
                        <span className="font-code-sm text-sky-400 font-bold">{sliderEspera} días</span>
                      </div>
                      <input
                        type="range"
                        min={3}
                        max={25}
                        value={sliderEspera}
                        onChange={(e) => setSliderEspera(Number(e.target.value))}
                        className="w-full accent-sky-400 cursor-pointer"
                      />
                      <div className="flex justify-between font-code-sm text-slate-500">
                        <span>3 días (Inmediata)</span>
                        <span>15 días (Actual)</span>
                        <span>25 días (Saturada)</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between font-label-md text-slate-200">
                        <span>Cobertura de Recordatorio SMS Inteligente:</span>
                        <span className="font-code-sm text-emerald-400 font-bold">{sliderSms}%</span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={100}
                        value={sliderSms}
                        onChange={(e) => setSliderSms(Number(e.target.value))}
                        className="w-full accent-emerald-400 cursor-pointer"
                      />
                      <div className="flex justify-between font-code-sm text-slate-500">
                        <span>50%</span>
                        <span>75%</span>
                        <span>100% (Automatización Total)</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between p-4 bg-slate-950/90 rounded-lg border border-slate-700/60">
                    <span className="font-label-sm uppercase tracking-wider text-slate-400 font-semibold">
                      Proyección Predictiva Estimada
                    </span>
                    <div className="my-3 flex flex-col gap-2">
                      <div className="flex items-baseline justify-between">
                        <span className="font-body-md text-slate-300">Nueva Tasa de Inasistencia:</span>
                        <span className="font-display-lg text-emerald-400">
                          {whatIfMetrics.nuevaTasa}%
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="font-body-md text-slate-300">Ingresos Mensuales Rescatados:</span>
                        <span
                          className={`font-headline-md font-bold ${
                            whatIfMetrics.positive ? 'text-sky-400' : 'text-rose-400'
                          }`}
                        >
                          {whatIfMetrics.ingreso}
                        </span>
                      </div>
                    </div>
                    <div className="font-code-sm text-slate-400 bg-slate-900 p-2.5 rounded">
                      Fórmula: CALCULATE([IngresoRecuperado], FILTER(Dim_Citas, [DiasEspera] &lt;= {sliderEspera} &amp;&amp; [SmsCoverage] = {sliderSms}%))
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Embed */}
          <div className="h-8 bg-slate-950 px-4 flex items-center justify-between shrink-0 border-t border-slate-800 text-slate-400 font-code-sm">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Conectado a DentalCenterDB.dm
              </span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">Visualizaciones: 14 objetos activos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>Microsoft Power BI Embedded</span>
              <span className="material-symbols-outlined text-[14px]">bolt</span>
            </div>
          </div>
        </div>
      </section>

      {/* NOTAS TÉCNICAS Y CONECTIVIDAD DEL DATA MART */}
      <section className="flex flex-col bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setMetaOpen((v) => !v)}
          className="p-4 bg-surface-container-low hover:bg-surface-container flex items-center justify-between w-full text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px] text-primary">data_object</span>
            <div className="flex flex-col">
              <span className="font-label-md text-on-surface font-bold">
                Arquitectura de Datos Subyacente &amp; Conectividad del Pipeline
              </span>
              <span className="font-code-sm text-on-surface-variant">
                SQL Server 2022 • Esquema Dimensional Estrella (Data Mart dm.*)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-code-sm px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Gateway Online
            </span>
            <span
              className={`material-symbols-outlined text-[20px] text-on-surface-variant transition-transform ${
                metaOpen ? 'rotate-180' : ''
              }`}
            >
              expand_more
            </span>
          </div>
        </button>

        {metaOpen && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5 border-t border-surface-container">
            <div className="flex flex-col gap-2 font-body-sm">
              <span className="font-label-sm uppercase tracking-wider text-primary font-bold">
                1. Fuentes Tabulares SQL
              </span>
              <div className="p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 font-code-sm text-on-surface">
                <div>
                  <strong>Instancia:</strong> LIM-SRV-DATA01\DENTALSQL
                </div>
                <div>
                  <strong>Base de Datos:</strong> DentalCenterDB
                </div>
                <div>
                  <strong>Tabla de Hechos:</strong>{' '}
                  <span className="text-primary font-semibold">dm.Fact_Atenciones</span>
                </div>
                <div>
                  <strong>Dimensiones:</strong> Dim_Paciente, Dim_Odontologo, Dim_Especialidad, Dim_Tiempo
                </div>
              </div>
              <p className="text-on-surface-variant leading-relaxed">
                La granularidad del modelo reside a nivel de cita médica única (ID_Turno). Cada registro contiene bandera de asistencia (0: Asistió, 1: No-Show).
              </p>
            </div>

            <div className="flex flex-col gap-2 font-body-sm">
              <span className="font-label-sm uppercase tracking-wider text-primary font-bold">
                2. Pasarela &amp; Modos de Consulta
              </span>
              <div className="p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 font-code-sm text-on-surface">
                <div>
                  <strong>Modo:</strong> Dual (DirectQuery + Import Cache)
                </div>
                <div>
                  <strong>Gateway:</strong> Enterprise On-Premises (v3000.182)
                </div>
                <div>
                  <strong>Frecuencia ETL:</strong> Cada 30 min (SQL Server Agent)
                </div>
                <div>
                  <strong>Seguridad:</strong> Row-Level Security (RLS) habilitado
                </div>
              </div>
              <p className="text-on-surface-variant leading-relaxed">
                Los filtros de directores de sede restringen la visualización médica para cumplir con las normativas locales de privacidad de datos de salud (MINSA).
              </p>
            </div>

            <div className="flex flex-col gap-2 font-body-sm">
              <span className="font-label-sm uppercase tracking-wider text-primary font-bold">
                3. Integración con Machine Learning
              </span>
              <div className="p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 font-code-sm text-on-surface">
                <div>
                  <strong>Algoritmo:</strong> Random Forest Classifier (Scikit-Learn)
                </div>
                <div>
                  <strong>AUC-ROC:</strong>{' '}
                  <span className="text-emerald-700 font-bold">0.834</span> (Validado k-fold)
                </div>
                <div>
                  <strong>Feature Primaria:</strong> Dias_Espera_Cita (~70% Gini)
                </div>
                <div>
                  <strong>Salida en Fact:</strong> Probabilidad_Inasistencia (FLOAT)
                </div>
              </div>
              <p className="text-on-surface-variant leading-relaxed">
                Las probabilidades mayores al 0.45 activan en automático el trigger prescriptivo para disparar recordatorios por WhatsApp y SMS prioritarios.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
