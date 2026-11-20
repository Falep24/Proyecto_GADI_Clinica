import React, { useEffect, useMemo, useState } from 'react';
import { SqlConsole } from '../components/SqlConsole';
import {
  addDaysToIsoDate,
  computeNoShowProbability,
  getTodayIsoDate,
  useClinical,
} from '../context/ClinicalContext';
import { clinicalApi, FASTAPI_BASE_URL } from '../services/api';

export const SimulatorEtlPage: React.FC = () => {
  const {
    patients,
    treatments,
    dentists,
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

  const todayIso = useMemo(() => getTodayIsoDate(), []);

  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [selectedDentistId, setSelectedDentistId] = useState<number>(2);
  const [edad, setEdad] = useState<number>(29);
  const [genero, setGenero] = useState<'F' | 'M'>('F');
  const [cpmsCode, setCpmsCode] = useState<string>('CPMS-05');
  const [fechaProgramacion, setFechaProgramacion] = useState<string>(todayIso);
  const [fechaCita, setFechaCita] = useState<string>(addDaysToIsoDate(todayIso, 14));
  const [distrito, setDistrito] = useState<string>('centro');
  const [smsActivo, setSmsActivo] = useState<boolean>(true);
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<number>(0);
  const [apiPredictedRisk, setApiPredictedRisk] = useState<number | null>(null);
  const [isSavingSim, setIsSavingSim] = useState<boolean>(false);

  // Al seleccionar un paciente de la BD, sincronizar su edad y género en el simulador
  useEffect(() => {
    if (!selectedPatientId && patients.length > 0) {
      setSelectedPatientId(patients[0].idPaciente);
    }
  }, [patients, selectedPatientId]);

  useEffect(() => {
    if (treatments.length > 0 && !treatments.some((t) => t.codigo === cpmsCode)) {
      setCpmsCode(treatments[0].codigo);
    }
  }, [treatments, cpmsCode]);

  const handleSelectPatient = (idPac: string) => {
    setSelectedPatientId(idPac);
    const pt = patients.find((p) => p.idPaciente === idPac);
    if (pt) {
      setEdad(pt.edad);
      setGenero(pt.genero);
    }
  };

  const selectedTreatment = useMemo(
    () => treatments.find((t) => t.codigo === cpmsCode) || treatments[0],
    [treatments, cpmsCode]
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
          fechaCita,
          idPaciente: selectedPatientId || undefined,
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
  }, [edad, genero, cpmsCode, diasEspera, distrito, smsActivo, fechaCita, selectedPatientId]);

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

    // Umbrales unificados con backend y notebook: Alto >= 50%, Medio >= 35%
    if (totalRisk >= 50) {
      riskLabel = 'RIESGO ALTO';
      riskSub = 'Crítico ≥ 50%';
      strokeClass = 'text-error';
      badgeClass = 'bg-red-50 text-red-800';
      subClass = 'text-error';
    } else if (totalRisk >= 35) {
      riskLabel = 'RIESGO MEDIO';
      riskSub = 'Precaución 35% - 49%';
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
    setFechaProgramacion(todayIso);
    setFechaCita(addDaysToIsoDate(todayIso, 21));
    setEdad(24);
    setSmsActivo(false);
    setCpmsCode('CPMS-05');
    appendSqlLog(
      'PRESET',
      'Caso crítico inyectado: 21 días de espera, sin confirmación SMS, Endodoncia Unirradicular.',
      'warn'
    );
    pushToast('Caso Crítico Cargado', 'Simulación configurada con 21 días de espera sin SMS.', 'warning');
  };

  const handleApplySlotAdvance = () => {
    setFechaCita(addDaysToIsoDate(fechaProgramacion, 3));
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
    const targetPatientId = selectedPatientId || patients[0]?.idPaciente;
    if (!targetPatientId) {
      pushToast('Paciente Requerido', 'Seleccione un paciente de oltp.Pacientes.', 'warning');
      return;
    }
    setIsSavingSim(true);
    try {
      await addOltpAppointment({
        idPaciente: targetPatientId,
        odontologoId: selectedDentistId,
        tratamientoCodigo: selectedTreatment.codigo,
        costo: selectedTreatment.costo,
        fechaCita,
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
              modelo_rf_dental.pkl Activo
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
              <span className="font-code-md font-semibold text-on-surface">modelo_rf_dental.pkl</span>
            </div>
          </div>
          <div className="flex flex-col pr-4 sm:border-r border-outline-variant/30">
            <span className="font-label-sm text-on-surface-variant uppercase">AUC-ROC Validación</span>
            <span className="font-headline-md font-bold text-emerald-700 tabular-nums">{modelAuc}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-on-surface-variant uppercase">Umbrales RF</span>
            <span className="font-code-md font-semibold text-primary">35% / 50%</span>
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
              {/* Paciente y Odontólogo */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface">Paciente (oltp.Pacientes)</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => handleSelectPatient(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm rounded-lg px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary"
                >
                  {patients.map((p) => (
                    <option key={p.idPaciente} value={p.idPaciente}>
                      #{p.idPaciente} ({p.genero}, {p.edad}a — {p.barrio})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface">Odontólogo (oltp.Odontologos)</label>
                <select
                  value={selectedDentistId}
                  onChange={(e) => setSelectedDentistId(Number(e.target.value))}
                  className="w-full bg-surface-container-low text-on-surface font-body-sm rounded-lg px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary"
                >
                  {dentists.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} — {d.nombre} ({d.especialidad})
                    </option>
                  ))}
                </select>
              </div>

              {/* Edad */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface flex items-center justify-between">
                  <span>Edad del Paciente</span>
                  <span className="font-code-sm text-on-surface-variant">{edad} años</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={edad}
                    onChange={(e) => setEdad(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className="w-full bg-surface-container-low text-on-surface font-body-md rounded-lg px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary transition-all"
                  />
                  <span className="absolute right-3 top-2.5 font-label-sm text-on-surface-variant">
                    años
                  </span>
                </div>
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
              </div>

              {/* Tratamiento CPMS */}
              <div className="md:col-span-2 flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface flex items-center justify-between">
                  <span>Procedimiento Odontológico (oltp.Tratamientos)</span>
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
                    {treatments.map((t) => (
                      <option key={t.codigo} value={t.codigo}>
                        {t.codigo}: {t.nombre} — S/ {t.costo.toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-2.5 text-on-surface-variant pointer-events-none text-[20px]">
                    unfold_more
                  </span>
                </div>
              </div>

              {/* Fecha Programación */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface flex items-center justify-between">
                  <span>Fecha de Programación</span>
                  <span className="font-code-sm text-emerald-700 bg-emerald-50 px-1.5 rounded">
                    Emisión
                  </span>
                </label>
                <input
                  type="date"
                  value={fechaProgramacion}
                  onChange={(e) => setFechaProgramacion(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-code-md rounded-lg px-3.5 py-2 outline-none focus:ring-2 focus:ring-primary"
                />
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
                  min={fechaProgramacion}
                  value={fechaCita}
                  onChange={(e) => setFechaCita(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-code-md rounded-lg px-3.5 py-2 outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Distrito */}
              <div className="flex flex-col gap-1.5">
                <label className="font-label-md text-on-surface">Zonificación de Referencia</label>
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
              </div>

              {/* CTAs */}
              <div className="md:col-span-2 pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleLoadCriticalPreset}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">bolt</span>
                  Cargar Caso Crítico (21 días)
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
                  <span>Desglose de Factores RF</span>
                  <span className="font-code-sm text-primary">Score F(x)</span>
                </div>
                <div className="flex items-center justify-between font-label-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary" /> Tiempo de Espera ({diasEspera}d)
                  </span>
                  <span className="font-code-sm font-semibold text-error">
                    +{inference.waitScore.toFixed(1)} pts
                  </span>
                </div>
                <div className="flex items-center justify-between font-label-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-secondary" /> Edad del Paciente ({edad}a)
                  </span>
                  <span className="font-code-sm text-on-surface">
                    +{inference.ageScore.toFixed(1)} pts
                  </span>
                </div>
                <div className="flex items-center justify-between font-label-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" /> Confirmación SMS
                  </span>
                  <span className="font-code-sm text-emerald-700 font-medium">
                    {smsActivo ? 'SMSRecibido = 1' : 'SMSRecibido = 0'}
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
                      La holgura calculada (<strong>{diasEspera} días</strong>) incrementa significativamente la probabilidad de abandono.
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handleApplySlotAdvance}
                    className="px-3.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-on-primary font-label-sm transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">schedule_send</span>
                    Aplicar Adelanto (+3 días) y SMS
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
              SQL Server (SQLEXPRESS)
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
              <h3 className="font-headline-sm text-on-surface">Ingesta &amp; Rechazos</h3>
              <p className="font-body-sm text-on-surface-variant">
                Tablas de aterrizaje stg.Raw_NoShow, stg.Raw_CPMS y auditoría en stg.Rechazos_Ingesta.
              </p>
              <div className="mt-2 p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 font-code-sm">
                <div className="flex justify-between text-on-surface">
                  <span>stg.Rechazos_Ingesta:</span>
                  <span className="font-bold text-primary">
                    {stgQueueCount.toLocaleString()} filas
                  </span>
                </div>
                <div className="flex justify-between text-on-surface-variant text-[11px]">
                  <span>Tablas origen:</span>
                  <span>stg.Raw_NoShow / stg.Raw_CPMS</span>
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
                Limpia tipos de datos y carga nuevos registros en OLTP
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
                Esquema relacional transaccional con integridad referencial entre Pacientes, Odontologos, Tratamientos y Citas.
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
                  <span className="font-semibold">{dentists.length} especialistas</span>
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
                Sincroniza dimensiones, hechos y ejecuta scoring IA
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
                Modelo Estrella Kimball que alimenta los KPIs y almacena la probabilidad en dm.Resultados_Prediccion_IA.
              </p>
              <div className="mt-2 p-3 rounded-lg bg-surface-container-low flex flex-col gap-1 font-code-sm">
                <div className="flex justify-between text-on-surface">
                  <span>dm.Fact_Atenciones:</span>
                  <span className="font-semibold">{dmFactCount.toLocaleString()} regs</span>
                </div>
                <div className="flex justify-between text-on-surface">
                  <span>dm.Resultados_Prediccion_IA:</span>
                  <span className="font-semibold text-emerald-700">Sincronizado</span>
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
                  runWithProgress('Verificando modelo_rf_dental.pkl...', retrainAiModel)
                }
                className="w-full px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">neurology</span>
                <span>Verificar Modelo RF (.pkl)</span>
              </button>
              <span className="font-label-sm text-[10px] text-center text-on-surface-variant">
                Comprueba estado de modelo_rf_dental.pkl en memoria
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
