import React, { useEffect, useMemo, useState } from 'react';
import { SqlConsole } from '../components/SqlConsole';
import { computeNoShowProbability, useClinical } from '../context/ClinicalContext';
import { TREATMENTS } from '../data/initialData';
import { clinicalApi, FASTAPI_BASE_URL } from '../services/api';

export const SimulatorEtlPage: React.FC = () => {
  const {
    patients,
    stgQueueCount,
    oltpTotalCount,
    oltpPacientesCount,
    dmFactCount,
    modelAuc,
    isSyncingEtl,
    execStagingToOltp,
    syncOltpToDataMart,
    retrainAiModel,
    addOltpAppointment,
    appendSqlLog,
    pushToast,
  } = useClinical();

  const [edad, setEdad] = useState<number>(29);
  const [genero, setGenero] = useState<'F' | 'M'>('F');
  const [cpmsCode, setCpmsCode] = useState<string>('CPMS-8901');
  const [fechaProgramacion, setFechaProgramacion] = useState<string>('2026-11-12');
  const [fechaCita, setFechaCita] = useState<string>('2026-11-30');
  const [distrito, setDistrito] = useState<string>('centro');
  const [smsActivo, setSmsActivo] = useState<boolean>(true);
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<number>(0);
  const [apiPredictedRisk, setApiPredictedRisk] = useState<number | null>(null);
  const [isSavingSim, setIsSavingSim] = useState<boolean>(false);

  const selectedTreatment = useMemo(
    () => TREATMENTS.find((t) => t.codigo === cpmsCode) || TREATMENTS[5],
    [cpmsCode]
  );

  const diasEspera = useMemo(() => {
    const d1 = new Date(`${fechaProgramacion}T00:00:00`);
    const d2 = new Date(`${fechaCita}T00:00:00`);
    const diff = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    return Number.isNaN(diff) ? 0 : Math.max(0, diff);
  }, [fechaProgramacion, fechaCita]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await clinicalApi.predictEnVivo({
          edad,
          genero,
          tratamientoCodigo: cpmsCode,
          diasEspera,
          distrito,
          smsRecibido: smsActivo,
        });
        if (!cancelled && typeof res?.probabilidad === 'number') {
          setApiPredictedRisk(res.probabilidad);
        }
      } catch {
        if (!cancelled) setApiPredictedRisk(null);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [edad, genero, cpmsCode, diasEspera, distrito, smsActivo]);

  const inference = useMemo(() => {
    const waitScore = Math.min((diasEspera / 22) * 58, 68);
    let ageScore = 8;
    if (edad < 25) ageScore = 14;
    else if (edad > 60) ageScore = 12;
    const smsDeduction = smsActivo ? -15 : 0;

    const totalRisk =
      apiPredictedRisk ??
      computeNoShowProbability({
        diasEspera,
        edad,
        smsRecibido: smsActivo,
      });

    const circumference = 427.26;
    const dashOffset = circumference - (totalRisk / 100) * circumference;

    let riskLabel = 'RIESGO BAJO';
    let riskSub = 'Asistencia Favorable < 35%';
    let strokeClass = 'text-emerald-500';
    let badgeClass = 'bg-emerald-50 text-emerald-800';
    let subClass = 'text-emerald-700';

    if (totalRisk >= 65) {
      riskLabel = 'RIESGO ALTO';
      riskSub = 'Crítico ≥ 65%';
      strokeClass = 'text-error';
      badgeClass = 'bg-red-50 text-red-800';
      subClass = 'text-error';
    } else if (totalRisk >= 35) {
      riskLabel = 'RIESGO MEDIO';
      riskSub = 'Precaución 35% - 64%';
      strokeClass = 'text-amber-500';
      badgeClass = 'bg-amber-50 text-amber-800';
      subClass = 'text-amber-700';
    }

    return {
      waitScore,
      ageScore,
      smsDeduction,
      totalRisk,
      dashOffset,
      riskLabel,
      riskSub,
      strokeClass,
      badgeClass,
      subClass,
    };
  }, [apiPredictedRisk, diasEspera, edad, smsActivo]);

  const handleLoadCriticalPreset = () => {
    setFechaProgramacion('2026-11-12');
    setFechaCita('2026-12-03'); // +21 days
    setEdad(24);
    setSmsActivo(false);
    setCpmsCode('CPMS-8901');
    appendSqlLog(
      'PRESET',
      'Caso crítico inyectado: 21 días de espera, sin confirmación SMS, Endodoncia Molar.',
      'warn'
    );
    pushToast('Caso Crítico Cargado', 'Simulación configurada con >20 días de espera sin SMS.', 'warning');
  };

  const handleApplySlotAdvance = () => {
    setFechaCita('2026-11-15'); // 3 days wait
    setSmsActivo(true);
    appendSqlLog(
      'PRESCRIPTION',
      'Adelanto aplicado exitosamente: Tiempo de espera reducido a 3 días. SMS Forzado activado.',
      'success'
    );
    pushToast('Adelanto Aplicado', 'Cita reubicada a +3 días con confirmación SMS obligatoria.');
  };

  const handleSaveSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingSim) return;
    setIsSavingSim(true);
    try {
      const defaultPatient = patients[0];
      await addOltpAppointment({
        idPaciente: defaultPatient?.idPaciente || '47812903',
        odontologoId: 2,
        tratamientoCodigo: selectedTreatment.codigo,
        costo: selectedTreatment.costo,
        fechaCita: '2024-11-30',
        smsRecibido: smsActivo ? 1 : 0,
        noShow: 'Pendiente',
        probabilidad: inference.totalRisk,
      });
    } finally {
      setIsSavingSim(false);
    }
  };

  const runWithProgress = async (label: string, action: () => Promise<void>) => {
    setPipelineMessage(label);
    setPipelineProgress(25);
    const t1 = setTimeout(() => setPipelineProgress(65), 400);
    try {
      await action();
      setPipelineProgress(100);
    } finally {
      clearTimeout(t1);
      setTimeout(() => {
        setPipelineMessage(null);
        setPipelineProgress(0);
      }, 700);
    }
  };

  return (
    <div className="flex flex-col w-full gap-6">
      {/* HEADER */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary font-code-sm tracking-wide uppercase">
              Módulo 03 · Motor Prescriptivo
            </span>
            <span className="inline-flex items-center gap-1.5 font-label-sm text-on-surface-variant">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Inferencia RF en Memoria v2.4
            </span>
          </div>
          <h1 className="font-display-lg text-on-surface tracking-tight">
            Simulador Prescriptivo &amp; Telemetría ETL
          </h1>
          <p className="font-body-md text-on-surface-variant max-w-3xl">
            Asistencia predictiva en mostrador para mitigar el no-show clínico en tiempo de agendamiento y supervisión de la sincronización de datos entre capas{' '}
            <span className="font-code-sm font-semibold text-primary">stg</span>,{' '}
            <span className="font-code-sm font-semibold text-primary">oltp</span> y{' '}
            <span className="font-code-sm font-semibold text-primary">dm</span>.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0 bg-surface-container-lowest p-3 rounded-xl shadow-sm flex-wrap">
          <div className="flex items-center gap-2.5 pr-4 lg:border-r border-outline-variant/30">
            <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">model_training</span>
            </div>
            <div className="flex flex-col">
              <span className="font-label-sm text-on-surface-variant uppercase">Modelo Activo</span>
              <span className="font-code-md font-semibold text-on-surface">RandomForest_v2.pkl</span>
            </div>
          </div>
          <div className="flex flex-col pr-4 sm:border-r border-outline-variant/30">
            <span className="font-label-sm text-on-surface-variant uppercase">AUC-ROC Validación</span>
            <span className="font-headline-md font-bold text-emerald-700 tabular-nums">{modelAuc}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-on-surface-variant uppercase">Latencia Inferencia</span>
            <span className="font-code-md font-semibold text-primary">12.4 ms</span>
          </div>
        </div>
      </section>

      {/* SECCIÓN A: CALCULADORA DE RIESGO AL AGENDAR */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm">
              A
            </div>
            <h2 className="font-headline-md text-on-surface">
              Calculadora de Riesgo al Agendar (Inferencia en Recepción)
            </h2>
          </div>
          <span className="font-code-sm text-on-surface-variant">
            Endpoint: <span className="text-secondary font-medium">{FASTAPI_BASE_URL}/api/predecir-en-vivo</span>
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Form (7 cols) */}
          <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-5 lg:p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">person_edit</span>
                <span className="font-headline-sm text-on-surface">Ficha Operativa de Cita</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-sm">
                Modo En Directo
              </span>
            </div>

            <form onSubmit={handleSaveSimulation} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Edad */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface flex items-center justify-between">
                  <span>Edad del Paciente</span>
                  <span className="font-code-sm text-on-surface-variant">{edad} años</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={4}
                    max={95}
                    value={edad}
                    onChange={(e) => setEdad(Math.max(4, Math.min(95, Number(e.target.value) || 29)))}
                    className="w-full bg-surface-container-low text-on-surface font-body-md rounded-lg px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                  <span className="absolute right-3 top-2.5 font-label-sm text-on-surface-variant">
                    años
                  </span>
                </div>
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  Ponderación IA: 15% del vector de decisión
                </span>
              </div>

              {/* Género */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface">Género Registrado</label>
                <div className="grid grid-cols-2 gap-2 h-[44px]">
                  <button
                    type="button"
                    onClick={() => setGenero('F')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg transition-colors font-label-md ${
                      genero === 'F'
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">female</span>
                    <span>Femenino</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenero('M')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg transition-colors font-label-md ${
                      genero === 'M'
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">male</span>
                    <span>Masculino</span>
                  </button>
                </div>
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  Control sociodemográfico poblacional
                </span>
              </div>

              {/* Tratamiento CPMS */}
              <div className="md:col-span-2 flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface flex items-center justify-between">
                  <span>Procedimiento Odontológico (CPMS Perú)</span>
                  <span className="font-code-sm text-secondary font-semibold">
                    Arancel: S/ {selectedTreatment.costo.toFixed(2)}
                  </span>
                </label>
                <div className="relative">
                  <select
                    value={cpmsCode}
                    onChange={(e) => setCpmsCode(e.target.value)}
                    className="w-full appearance-none bg-surface-container-low text-on-surface font-body-md rounded-lg pl-3.5 pr-10 py-2.5 outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  >
                    {TREATMENTS.filter((t) => t.codigo.startsWith('CPMS')).map((t) => (
                      <option key={t.codigo} value={t.codigo}>
                        {t.codigo}: {t.nombre} — S/ {t.costo.toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-2.5 text-on-surface-variant pointer-events-none text-[20px]">
                    unfold_more
                  </span>
                </div>
                <div className="flex items-center justify-between font-label-sm text-on-surface-variant">
                  <span>Cód. Fonasa / SIS Mapeado a catálogo clínico Lima</span>
                  <span
                    className={`font-medium ${
                      selectedTreatment.severidad === 'high'
                        ? 'text-error'
                        : selectedTreatment.severidad === 'medium'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    Severidad de Intervención:{' '}
                    {selectedTreatment.severidad === 'high'
                      ? 'Alta'
                      : selectedTreatment.severidad === 'medium'
                      ? 'Moderada'
                      : 'Preventiva'}
                  </span>
                </div>
              </div>

              {/* Fecha Programación */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface flex items-center justify-between">
                  <span>Fecha de Programación</span>
                  <span className="font-code-sm text-emerald-700 bg-emerald-50 px-1.5 rounded">
                    Emisión Hoy
                  </span>
                </label>
                <input
                  type="date"
                  value={fechaProgramacion}
                  onChange={(e) => setFechaProgramacion(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-code-md rounded-lg px-3.5 py-2 outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  Momento exacto del contacto telefónico/físico
                </span>
              </div>

              {/* Fecha Deseada */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface flex items-center justify-between">
                  <span>Fecha Deseada de Cita</span>
                  <span className="font-code-sm font-bold text-primary">
                    {diasEspera} días de espera
                  </span>
                </label>
                <input
                  type="date"
                  value={fechaCita}
                  onChange={(e) => setFechaCita(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-code-md rounded-lg px-3.5 py-2 outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex items-center gap-1 text-[11px] font-medium text-error">
                  <span className="material-symbols-outlined text-[14px]">timer</span>
                  <span>
                    Variable Crítica: <strong className="font-mono">{diasEspera}</strong> días de holgura temporal
                  </span>
                </div>
              </div>

              {/* Distrito */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface">Distrito de Residencia</label>
                <div className="relative">
                  <select
                    value={distrito}
                    onChange={(e) => setDistrito(e.target.value)}
                    className="w-full appearance-none bg-surface-container-low text-on-surface font-body-md rounded-lg pl-3.5 pr-10 py-2.5 outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                  >
                    <option value="centro">Lima Centro (Miraflores, San Isidro, Breña)</option>
                    <option value="norte">Lima Norte (Los Olivos, Comas, SM Porres)</option>
                    <option value="sur">Lima Sur (Surco, Chorrillos, SJM)</option>
                    <option value="este">Lima Este (La Molina, Ate, SJL)</option>
                    <option value="callao">Prov. Const. del Callao</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-2.5 text-on-surface-variant pointer-events-none text-[20px]">
                    location_on
                  </span>
                </div>
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  Mapeo isócrono a Sede San Borja / Lima Central
                </span>
              </div>

              {/* Switch SMS */}
              <div className="flex flex-col justify-center gap-1.5 bg-surface-container-low p-3 rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-label-md font-semibold text-on-surface">
                      Recordatorio Inmediato SMS
                    </span>
                    <span className="font-code-sm text-[10px] text-on-surface-variant">
                      oltp.Citas.SMSRecibido = {smsActivo ? '1' : '0'}
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smsActivo}
                      onChange={(e) => setSmsActivo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-outline-variant rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                  </label>
                </div>
                <span className="font-label-sm text-[10px] text-emerald-800 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">shield</span>
                  Factor Protector IA: Disminuye riesgo base en ~15%
                </span>
              </div>

              {/* CTAs */}
              <div className="md:col-span-2 pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleLoadCriticalPreset}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">bolt</span>
                  Cargar Caso Crítico (&gt;15 días)
                </button>
                <button
                  type="submit"
                  disabled={isSavingSim}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-headline-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[20px]">save</span>
                  <span>
                    {isSavingSim
                      ? 'Guardando en /api/citas...'
                      : 'Guardar Cita en oltp.Citas y Ejecutar Inferencia'}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* Gauge & Preventive Alert (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-2">
                <span className="font-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                  Probabilidad de Inasistencia
                </span>
                <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-label-sm ${inference.badgeClass}`}>
                  <span className="w-2 h-2 rounded-full bg-current" />
                  <span className="font-bold">{inference.riskLabel}</span>
                </div>
              </div>

              <div className="relative w-52 h-52 flex items-center justify-center my-1">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="12"
                    className="text-surface-container"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    fill="transparent"
                    stroke="currentColor"
                    strokeDasharray="427.26"
                    strokeDashoffset={inference.dashOffset}
                    strokeLinecap="round"
                    strokeWidth="12"
                    className={`${inference.strokeClass} transition-all duration-500 ease-out`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-display-lg text-[44px] leading-tight font-extrabold text-on-surface tracking-tight tabular-nums">
                    {inference.totalRisk}%
                  </span>
                  <span className="font-label-sm uppercase tracking-wider text-on-surface-variant font-semibold">
                    No-Show Estimado
                  </span>
                  <span className={`font-code-sm font-medium mt-1 ${inference.subClass}`}>
                    {inference.riskSub}
                  </span>
                </div>
              </div>

              <div className="w-full bg-surface-container-low rounded-lg p-3 flex flex-col gap-2 mt-1 text-on-surface-variant">
                <div className="flex items-center justify-between text-on-surface font-label-sm font-semibold border-b border-outline-variant/20 pb-1">
                  <span>Desglose Ponderado RF</span>
                  <span className="font-code-sm text-primary">Score F(x)</span>
                </div>
                <div className="flex items-center justify-between font-label-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary" /> Tiempo de Espera (70%)
                  </span>
                  <span className="font-code-sm font-semibold text-error">
                    +{inference.waitScore.toFixed(1)} pts
                  </span>
                </div>
                <div className="flex items-center justify-between font-label-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-secondary" /> Edad del Paciente (15%)
                  </span>
                  <span className="font-code-sm text-on-surface">
                    +{inference.ageScore.toFixed(1)} pts
                  </span>
                </div>
                <div className="flex items-center justify-between font-label-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" /> Efecto SMS Confirmación (15%)
                  </span>
                  <span className="font-code-sm text-emerald-700 font-medium">
                    {smsActivo ? '-15.0 pts' : '0.0 pts (Sin Protección)'}
                  </span>
                </div>
              </div>
            </div>

            {diasEspera > 15 && (
              <div className="bg-red-50 text-red-950 rounded-xl p-4 shadow-sm flex flex-col gap-2.5 border border-red-200">
                <div className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-red-600 text-[24px] shrink-0 mt-0.5">
                    warning
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-headline-sm text-red-900 leading-tight">
                      Alerta Preventiva: La cita excede los 15 días de espera
                    </h3>
                    <p className="font-body-sm text-red-800">
                      La holgura calculada (<strong>{diasEspera} días</strong>) supera el umbral de deserción histórica (38% de abandono espontáneo).
                    </p>
                  </div>
                </div>

                <div className="bg-surface-container-lowest/90 rounded-lg p-3 flex flex-col gap-1.5 text-on-surface">
                  <span className="font-label-sm font-bold uppercase tracking-wider text-red-900">
                    Recomendaciones de Retención Inmediata:
                  </span>
                  <div className="flex items-start gap-2 font-body-sm">
                    <span className="material-symbols-outlined text-[16px] text-primary mt-0.5 shrink-0">
                      event_upcoming
                    </span>
                    <span>
                      <strong>1) Proponer adelanto de fecha con sobrecupo:</strong> Existen 2 cupos de contingencia este jueves en horario matutino.
                    </span>
                  </div>
                  <div className="flex items-start gap-2 font-body-sm">
                    <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5 shrink-0">
                      sms
                    </span>
                    <span>
                      <strong>2) Forzar envío de SMS y confirmación obligatoria 48h antes:</strong> Programado ticket en cola Twilio / WhatsApp Bot.
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleApplySlotAdvance}
                    className="px-3.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-on-primary font-label-sm transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">schedule_send</span>
                    Aplicar Adelanto Sugerido
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECCIÓN B: MONITOR DE ARQUITECTURA PIPELINE ETL */}
      <section className="flex flex-col gap-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-sm">
              B
            </div>
            <h2 className="font-headline-md text-on-surface">
              Monitor de Arquitectura Pipeline ETL (stg → oltp → dm)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-surface-container text-on-surface-variant font-code-sm">
              SQL Server 2022 Enterprise
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          {/* Capa 1: Staging */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-code-sm font-semibold">
                  1. Capa Staging [stg]
                </span>
                <span className="material-symbols-outlined text-outline text-[20px]">upload_file</span>
              </div>
              <h3 className="font-headline-sm text-on-surface">Archivos Crudos &amp; HC</h3>
              <p className="font-body-sm text-on-surface-variant">
                Ingesta polimórfica de fichas clínicas, hojas de citas diarias de recepcionistas en Excel y CSV de turnos.
              </p>
              <div className="mt-2 p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 font-code-sm">
                <div className="flex justify-between text-on-surface">
                  <span>Registros en cola:</span>
                  <span className="font-bold text-primary">
                    {stgQueueCount === 0
                      ? '0 en cola (Sincronizado)'
                      : `${stgQueueCount.toLocaleString()} filas`}
                  </span>
                </div>
                <div className="flex justify-between text-on-surface-variant text-[11px]">
                  <span>Esquema:</span>
                  <span>stg.Raw_Citas_Turno</span>
                </div>
                <div className="flex justify-between text-on-surface-variant text-[11px]">
                  <span>Formato origen:</span>
                  <span>UTF-8 / ISO-8859-1</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/20 flex flex-col gap-2">
              <button
                type="button"
                disabled={isSyncingEtl}
                onClick={() => runWithProgress('Ejecutando stg.usp_CargarOLTP...', execStagingToOltp)}
                className="w-full px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/90 text-on-secondary font-label-md transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">play_circle</span>
                <span>EXEC stg.usp_CargarOLTP</span>
              </button>
              <span className="font-label-sm text-[10px] text-center text-on-surface-variant">
                Limpia tipos de datos y reconcilia duplicados
              </span>
            </div>
          </div>

          {/* Capa 2: OLTP */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-code-sm font-semibold">
                  2. Capa Transaccional [oltp]
                </span>
                <span className="material-symbols-outlined text-primary text-[20px]">database</span>
              </div>
              <h3 className="font-headline-sm text-on-surface">Base DentalCenterDB</h3>
              <p className="font-body-sm text-on-surface-variant">
                Esquema relacional de tercera forma normal con integridad referencial, triggers de auditoría y bloqueos optimistas.
              </p>
              <div className="mt-2 p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 font-code-sm">
                <div className="flex justify-between text-on-surface">
                  <span>oltp.Citas:</span>
                  <span className="font-semibold">{oltpTotalCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-on-surface">
                  <span>oltp.Pacientes:</span>
                  <span className="font-semibold">
                    {(oltpPacientesCount || patients.length).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-on-surface">
                  <span>oltp.Odontologos:</span>
                  <span className="font-semibold">3 especialistas</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/20 flex flex-col gap-2">
              <button
                type="button"
                disabled={isSyncingEtl}
                onClick={() =>
                  runWithProgress('Ejecutando dm.usp_ETL_CargarDataMart...', syncOltpToDataMart)
                }
                className="w-full px-4 py-2 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">sync_alt</span>
                <span>EXEC dm.usp_ETL_CargarDataMart</span>
              </button>
              <span className="font-label-sm text-[10px] text-center text-on-surface-variant">
                Genera dimensiones y hechos en copo de nieve
              </span>
            </div>
          </div>

          {/* Capa 3: Data Mart & IA */}
          <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm flex flex-col justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-code-sm font-semibold">
                  3. Capa Data Mart &amp; IA [dm]
                </span>
                <span className="material-symbols-outlined text-secondary text-[20px]">psychology</span>
              </div>
              <h3 className="font-headline-sm text-on-surface">dm.Fact_Atenciones &amp; Scoring</h3>
              <p className="font-body-sm text-on-surface-variant">
                Almacén analítico dimensional que nutre los tableros Power BI y almacena la salida probabilística del modelo RF.
              </p>
              <div className="mt-2 p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 font-code-sm">
                <div className="flex justify-between text-on-surface">
                  <span>dm.Fact_Atenciones:</span>
                  <span className="font-semibold">{dmFactCount.toLocaleString()} regs</span>
                </div>
                <div className="flex justify-between text-on-surface">
                  <span>dm.Resultados_Prediccion_IA:</span>
                  <span className="font-semibold text-emerald-700">100% Sinc</span>
                </div>
                <div className="flex justify-between text-on-surface-variant text-[11px]">
                  <span>Métricas de Calidad:</span>
                  <span>F1: 0.79 | AUC: {modelAuc}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/20 flex flex-col gap-2">
              <button
                type="button"
                disabled={isSyncingEtl}
                onClick={() =>
                  runWithProgress('Reentrenando RandomForestClassifier...', retrainAiModel)
                }
                className="w-full px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">neurology</span>
                <span>Reentrenar Modelo (Scikit-Learn)</span>
              </button>
              <span className="font-label-sm text-[10px] text-center text-on-surface-variant">
                Actualiza pipeline serializado en binario Pickle
              </span>
            </div>
          </div>
        </div>

        {pipelineMessage && (
          <div className="w-full bg-surface-container-lowest p-3.5 rounded-lg shadow-sm flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="font-label-md font-medium text-on-surface">{pipelineMessage}</span>
            </div>
            <div className="w-48 bg-surface-container rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${pipelineProgress}%` }}
              />
            </div>
          </div>
        )}

        <SqlConsole
          title="SQL Server Management Telemetry // DentalCenterDB [T-SQL Execution Stream]"
          variant="full"
        />
      </section>
    </div>
  );
};
