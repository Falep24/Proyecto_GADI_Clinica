import React, { useState } from 'react';
import { useClinical } from '../context/ClinicalContext';
import { LOGO_URL } from '../data/initialData';
import { FASTAPI_BASE_URL } from '../services/api';
import { ModuleId } from '../types/clinical';

interface AppShellProps {
  children: React.ReactNode;
}

const NAV_ITEMS: { id: ModuleId; label: string; shortLabel: string; group: 'oltp' | 'bi'; icon: string; sidebarLabel: string }[] = [
  {
    id: 'gestion-de-pacientes',
    label: 'Gestión de Pacientes',
    shortLabel: 'Pacientes',
    group: 'oltp',
    icon: 'person_search',
    sidebarLabel: 'Pacientes (CRUD)',
  },
  {
    id: 'agendamiento-y-control-de-citas',
    label: 'Agendamiento & Citas IA',
    shortLabel: 'Citas IA',
    group: 'oltp',
    icon: 'calendar_clock',
    sidebarLabel: 'Citas & Asistente IA',
  },
  {
    id: 'inteligencia-de-negocios',
    label: 'Power BI & KPIs',
    shortLabel: 'Power BI',
    group: 'bi',
    icon: 'query_stats',
    sidebarLabel: 'Cuadro de Mando Integral',
  },
  {
    id: 'agenda-inteligente-y-retencion',
    label: 'Agenda Inteligente & Retención',
    shortLabel: 'Retención IA',
    group: 'bi',
    icon: 'smart_toy',
    sidebarLabel: 'Matriz IA de Pacientes',
  },
  {
    id: 'simulador-prescriptivo-y-pipeline-etl',
    label: 'Simulador & Pipeline ETL',
    shortLabel: 'Simulador ETL',
    group: 'bi',
    icon: 'account_tree',
    sidebarLabel: 'Pipeline ETL & Telemetría',
  },
];

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const {
    activeModule,
    setActiveModule,
    workspaceMode,
    setWorkspaceMode,
    apiConnected,
    isLoadingData,
    refreshAllFromApi,
    lastSyncTime,
    isSyncingEtl,
    syncOltpToDataMart,
    retentionRows,
    toasts,
    dismissToast,
  } = useClinical();

  const [logoError, setLogoError] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const highRiskPatients = retentionRows.filter((r) => r.probabilidad >= 50);

  const handleModeSwitch = (mode: 'direccion' | 'recepcion') => {
    setWorkspaceMode(mode);
    if (mode === 'direccion' && (activeModule === 'gestion-de-pacientes' || activeModule === 'agendamiento-y-control-de-citas')) {
      setActiveModule('inteligencia-de-negocios');
    } else if (mode === 'recepcion' && activeModule === 'inteligencia-de-negocios') {
      setActiveModule('agendamiento-y-control-de-citas');
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col">
      {/* FIXED TOP HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-surface-container">
        <div className="h-16 lg:h-20 w-full px-4 lg:px-6 flex items-center justify-between gap-4">
          {/* Left: Brand + Workspace Mode Switch */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="xl:hidden p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
              aria-label="Abrir menú de navegación"
            >
              <span className="material-symbols-outlined text-[22px]">
                {mobileMenuOpen ? 'close' : 'menu'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('inteligencia-de-negocios')}
              className="flex items-center gap-2.5 text-left shrink-0"
            >
              {!logoError ? (
                <img
                  src={LOGO_URL}
                  alt="Sonrisa Integral Logotipo"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="h-8 w-8 rounded-lg object-contain bg-surface-container-low p-0.5 shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[20px]">dentistry</span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="font-headline-sm text-on-surface tracking-tight leading-tight whitespace-nowrap">
                  Sonrisa Integral
                </span>
                <span className="font-label-sm text-on-surface-variant flex items-center gap-1.5 whitespace-nowrap">
                  <span>Centro de Comando BI &amp; IA</span>
                  <span className="w-1 h-1 rounded-full bg-outline-variant hidden sm:inline-block" />
                  <span className="hidden sm:inline">Sede Central Lima</span>
                </span>
              </div>
            </button>

            {/* Mode Switcher (2XL+) */}
            <div className="hidden 2xl:flex items-center gap-2 pl-2 ml-1">
              <div className="flex items-center bg-surface-container-low p-1 rounded-full">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('direccion')}
                  className={`px-2.5 py-1 rounded-full font-label-sm transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    workspaceMode === 'direccion'
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">corporate_fare</span>
                  <span>Dirección General</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('recepcion')}
                  className={`px-2.5 py-1 rounded-full font-label-sm transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    workspaceMode === 'recepcion'
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">support_agent</span>
                  <span>Recepción OLTP</span>
                </button>
              </div>
            </div>
          </div>

          {/* Center: Single-line Top Navigation */}
          <nav className="hidden lg:flex items-center h-full gap-4 xl:gap-5 overflow-x-auto no-scrollbar">
            {NAV_ITEMS.map((item) => {
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`h-full flex items-center px-1 font-label-md whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    isActive
                      ? 'text-primary font-bold border-primary'
                      : 'text-on-surface-variant hover:text-on-surface border-transparent'
                  }`}
                >
                  <span className="hidden 2xl:inline">{item.label}</span>
                  <span className="2xl:hidden">{item.shortLabel}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: ETL Status, Sync, Notifications, User */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden md:flex items-center gap-2 bg-surface-container-low px-2.5 py-1.5 rounded-lg font-code-sm text-on-surface whitespace-nowrap shrink-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  apiConnected ? 'bg-emerald-600' : 'bg-amber-500'
                }`}
              />
              <span className={`font-medium ${apiConnected ? 'text-emerald-800' : 'text-amber-800'}`}>
                {apiConnected ? 'FastAPI OK' : 'Caché Local'}
              </span>
              <span className="text-outline-variant">|</span>
              <span className="text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                <span>{lastSyncTime}</span>
              </span>
            </div>

            <button
              type="button"
              onClick={syncOltpToDataMart}
              disabled={isSyncingEtl}
              title="Forzar Sincronización Analítica"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary font-label-sm transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-[16px] ${isSyncingEtl ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span className="hidden xl:inline">Sync Analítica</span>
            </button>

            {/* Notification Bell with Live Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAlertsOpen((v) => !v)}
                className="relative p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors"
                aria-label="Alertas clínicas"
              >
                <span className="material-symbols-outlined text-[22px]">notifications</span>
                {highRiskPatients.length > 0 && (
                  <span className="absolute top-0.5 right-0.5 flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-on-error bg-error rounded-full">
                    {highRiskPatients.length}
                  </span>
                )}
              </button>

              {alertsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-surface-container-lowest rounded-xl shadow-xl border border-surface-container p-3 z-50">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-surface-container">
                    <span className="font-headline-sm text-on-surface">
                      Alertas Críticas de No-Show
                    </span>
                    <button
                      type="button"
                      onClick={() => setAlertsOpen(false)}
                      className="text-on-surface-variant hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                    {highRiskPatients.length === 0 ? (
                      <p className="font-body-sm text-on-surface-variant py-3 text-center">
                        Sin alertas críticas pendientes.
                      </p>
                    ) : (
                      highRiskPatients.slice(0, 5).map((r) => (
                        <button
                          key={r.idCita}
                          type="button"
                          onClick={() => {
                            setAlertsOpen(false);
                            setActiveModule('agenda-inteligente-y-retencion');
                          }}
                          className="text-left p-2 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-label-sm text-on-surface truncate">
                              IdPaciente: {r.dni}
                            </div>
                            <div className="font-code-sm text-on-surface-variant">
                              Cita #{r.idCita} · Espera {r.tiempoEspera}d
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-code-sm font-bold shrink-0">
                            {r.probabilidad}%
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pl-1">
              <div className="hidden text-right sm:block">
                <span className="block font-label-md text-on-surface font-semibold whitespace-nowrap">
                  Dra. Elena Vega
                </span>
                <span className="block font-label-sm text-on-surface-variant whitespace-nowrap">
                  Directora Médica
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div
            className="fixed inset-0 bg-inverse-surface/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-16 bottom-0 w-72 bg-surface-container-lowest z-50 flex flex-col py-4 px-3 shadow-xl overflow-y-auto">
            <div className="mb-3 px-2 flex gap-1 bg-surface-container-low p-1 rounded-lg">
              <button
                type="button"
                onClick={() => handleModeSwitch('direccion')}
                className={`flex-1 py-1.5 rounded-md font-label-sm ${
                  workspaceMode === 'direccion' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'
                }`}
              >
                Dirección
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch('recepcion')}
                className={`flex-1 py-1.5 rounded-md font-label-sm ${
                  workspaceMode === 'recepcion' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'
                }`}
              >
                Recepción
              </button>
            </div>
            <div className="px-2 mb-1">
              <span className="font-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                Operaciones Clínicas (OLTP)
              </span>
            </div>
            <nav className="flex flex-col gap-1 mb-4">
              {NAV_ITEMS.filter((i) => i.group === 'oltp').map((item) => {
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveModule(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-body-sm text-left transition-all ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-semibold'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    <span>{item.sidebarLabel}</span>
                  </button>
                );
              })}
            </nav>
            <div className="px-2 mb-1">
              <span className="font-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                Consola Analítica (BI &amp; IA)
              </span>
            </div>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.filter((i) => i.group === 'bi').map((item) => {
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveModule(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-body-sm text-left transition-all ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container font-semibold'
                        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    <span>{item.sidebarLabel}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* DESKTOP FIXED LEFT SIDEBAR */}
      <aside className="fixed left-0 top-20 bottom-0 w-64 bg-surface-container-lowest z-40 hidden xl:flex flex-col py-space-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-r border-surface-container overflow-y-auto">
        <div className="px-space-md mb-space-xs">
          <span className="font-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
            Operaciones Clínicas (OLTP)
          </span>
        </div>
        <nav className="px-space-sm flex flex-col gap-1 mb-space-md">
          {NAV_ITEMS.filter((i) => i.group === 'oltp').map((item) => {
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveModule(item.id)}
                className={`flex items-center gap-space-sm px-space-md py-2.5 rounded-lg font-body-sm text-left transition-all ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span>{item.sidebarLabel}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-space-md mb-space-xs">
          <span className="font-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
            Consola Analítica (BI &amp; IA)
          </span>
        </div>
        <nav className="flex-1 px-space-sm flex flex-col gap-1">
          {NAV_ITEMS.filter((i) => i.group === 'bi').map((item) => {
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveModule(item.id)}
                className={`flex items-center gap-space-sm px-space-md py-2.5 rounded-lg font-body-sm text-left transition-all ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                <span>{item.sidebarLabel}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-space-md pt-space-sm mt-auto">
          <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1.5">
            <span className="font-label-sm text-on-surface-variant font-semibold">
              Backend Local FastAPI
            </span>
            <span className="font-code-sm text-primary truncate" title={FASTAPI_BASE_URL}>
              {FASTAPI_BASE_URL}
            </span>
            <div className="flex items-center justify-between gap-2">
              <span
                className={`font-label-sm flex items-center gap-1 ${
                  apiConnected ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    apiConnected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                {apiConnected ? 'Conectado' : 'Sin conexión (Caché)'}
              </span>
              <button
                type="button"
                onClick={() => refreshAllFromApi(false)}
                disabled={isLoadingData}
                title="Recargar desde FastAPI"
                className="text-primary hover:underline font-label-sm disabled:opacity-50"
              >
                {isLoadingData ? 'Cargando...' : 'Refrescar'}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT VIEWPORT */}
      <div className="w-full xl:pl-64 pt-16 lg:pt-20">
        <main className="w-full min-h-[calc(100vh-5rem)] bg-surface px-4 lg:px-6 py-6">
          {children}
        </main>
      </div>

      {/* GLOBAL TOAST STACK */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md pointer-events-none">
        {toasts.map((t) => {
          const icon =
            t.variant === 'error'
              ? 'error'
              : t.variant === 'warning'
              ? 'warning'
              : t.variant === 'info'
              ? 'info'
              : 'check_circle';
          const iconColor =
            t.variant === 'error'
              ? 'text-red-400'
              : t.variant === 'warning'
              ? 'text-amber-300'
              : t.variant === 'info'
              ? 'text-sky-300'
              : 'text-emerald-400';

          return (
            <div
              key={t.id}
              className="pointer-events-auto bg-inverse-surface text-inverse-on-surface px-4 py-3 rounded-xl shadow-xl flex items-start gap-3 border border-slate-700/60"
            >
              <span className={`material-symbols-outlined text-[20px] mt-0.5 shrink-0 ${iconColor}`}>
                {icon}
              </span>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-label-md font-bold text-inverse-on-surface">{t.title}</span>
                <span className="font-body-sm text-surface-dim">{t.message}</span>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="text-slate-400 hover:text-white shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
