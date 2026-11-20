import React, { useRef, useState } from 'react';
import { useClinical } from '../context/ClinicalContext';

const DEFAULT_PBI_URL =
  'https://app.powerbi.com/reportEmbed?reportId=9e5b0388-f1c3-4a72-96ff-7611a7f9036e&autoAuth=true&ctid=8dbd6711-3051-4a69-bb5e-8714606711d6';

export const PowerBiDashboardPage: React.FC = () => {
  const { lastSyncTime, pushToast } = useClinical();

  const [pbiUrl, setPbiUrl] = useState(DEFAULT_PBI_URL);
  const [activeEmbedUrl, setActiveEmbedUrl] = useState(DEFAULT_PBI_URL);
  const [embedTitle, setEmbedTitle] = useState(
    'Dashboard Clínico Ejecutivo • DentalCenter Power BI'
  );
  const [isFrameLoading, setIsFrameLoading] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);

  const embedRef = useRef<HTMLDivElement>(null);

  const handleLoadReport = () => {
    const clean = pbiUrl.trim();
    if (!clean) {
      pushToast('URL Requerida', 'Ingrese una URL válida de Power BI Embed.', 'warning');
      return;
    }
    setIsFrameLoading(true);
    setActiveEmbedUrl(clean);
    setTimeout(() => {
      setIsFrameLoading(false);
      setEmbedTitle(
        `Dashboard Clínico Ejecutivo • ${clean.length > 50 ? `${clean.slice(0, 48)}...` : clean}`
      );
      pushToast('Reporte Sincronizado', 'Reporte Power BI actualizado en el visor.');
    }, 350);
  };

  const handleResetDefault = () => {
    setPbiUrl(DEFAULT_PBI_URL);
    setActiveEmbedUrl(DEFAULT_PBI_URL);
    setEmbedTitle('Dashboard Clínico Ejecutivo • DentalCenter Power BI');
    pushToast('Reporte Restablecido', 'Enlace oficial de Power BI restaurado.', 'info');
  };

  const handleFullscreen = () => {
    const el = embedRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {
        pushToast('Pantalla Completa', 'Modo expandido bloqueado por el navegador.', 'info');
      });
    } else {
      document.exitFullscreen?.();
    }
  };

  return (
    <div className="flex flex-col w-full gap-5">
      {/* CABECERA LIMPIA SIN FILTROS EXTERNOS */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 lg:p-6 bg-surface-container-lowest rounded-xl shadow-sm">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-code-sm px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-semibold tracking-wide uppercase">
              Power BI Service • Data Mart dm
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
            Cuadro de mando interactivo y simulador financiero What-If conectado a DentalCenterDB (92,901 pacientes).
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleFullscreen}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md shadow-sm transition-all whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px]">fullscreen</span>
            <span>Expandir Dashboard</span>
          </button>
        </div>
      </section>

      {/* VISOR EXCLUSIVO DE POWER BI */}
      <section className="flex flex-col bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 bg-surface-container-high flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex-1 flex items-center bg-surface-container-lowest rounded-lg px-3 py-1.5 shadow-inner">
            <span className="material-symbols-outlined text-[20px] text-primary shrink-0 mr-2">
              link
            </span>
            <input
              type="text"
              value={pbiUrl}
              onChange={(e) => setPbiUrl(e.target.value)}
              placeholder="Pegue aquí la URL de inserción de su reporte Power BI..."
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
              onClick={handleResetDefault}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface font-label-md transition-all whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[16px]">restart_alt</span>
              <span>Restablecer Enlace</span>
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

        {/* Contenedor Iframe */}
        <div
          ref={embedRef}
          className="relative w-full bg-slate-900 text-slate-100 flex flex-col justify-between overflow-hidden"
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
              <span className="text-emerald-400 font-semibold">● Power BI Service En Vivo</span>
            </div>
          </div>

          <div
            className={`w-full bg-white transition-opacity duration-300 ${
              isFrameLoading ? 'opacity-40' : 'opacity-100'
            }`}
          >
            <iframe
              title={embedTitle}
              src={activeEmbedUrl}
              className="w-full h-[780px] border-0 block"
              allowFullScreen
            />
          </div>

          <div className="h-8 bg-slate-950 px-4 flex items-center justify-between shrink-0 border-t border-slate-800 text-slate-400 font-code-sm">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Conectado a DentalCenterDB.dm (92,901 registros)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>Microsoft Power BI Embedded</span>
              <span className="material-symbols-outlined text-[14px]">bolt</span>
            </div>
          </div>
        </div>
      </section>

      {/* NOTAS TÉCNICAS Y CONECTIVIDAD DEL DATA MART (COLAPSADA POR DEFECTO) */}
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
              Data Mart Activo
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
                <div><strong>Instancia:</strong> DESKTOP-DC7H2UL</div>
                <div><strong>Base de Datos:</strong> DentalCenterDB</div>
                <div><strong>Tabla de Hechos:</strong> <span className="text-primary font-semibold">dm.Fact_Atenciones</span></div>
                <div><strong>Dimensiones:</strong> Dim_Paciente, Dim_Medico, Dim_Tratamiento, Dim_Tiempo</div>
              </div>
            </div>

            <div className="flex flex-col gap-2 font-body-sm">
              <span className="font-label-sm uppercase tracking-wider text-primary font-bold">
                2. Modos de Consulta
              </span>
              <div className="p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 font-code-sm text-on-surface">
                <div><strong>Modo:</strong> Importación Directa (Data Mart dm)</div>
                <div><strong>Servicio Nube:</strong> Power BI Service</div>
                <div><strong>Segmentación:</strong> Filtrado interactivo desde reporte</div>
              </div>
            </div>

            <div className="flex flex-col gap-2 font-body-sm">
              <span className="font-label-sm uppercase tracking-wider text-primary font-bold">
                3. Integración con Machine Learning
              </span>
              <div className="p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 font-code-sm text-on-surface">
                <div><strong>Algoritmo:</strong> Random Forest Classifier (Scikit-Learn)</div>
                <div><strong>Pacientes Evaluados:</strong> <span className="text-emerald-700 font-bold">92,901</span></div>
                <div><strong>Salida en Data Mart:</strong> dm.Resultados_Prediccion_IA</div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};