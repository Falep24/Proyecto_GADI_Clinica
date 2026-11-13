import React, { useEffect, useMemo, useState } from 'react';
import { SqlConsole } from '../components/SqlConsole';
import { computeNoShowProbability, useClinical } from '../context/ClinicalContext';
import { DENTISTS, TREATMENTS } from '../data/initialData';
import { clinicalApi } from '../services/api';
import { NoShowStatus, OltpAppointment } from '../types/clinical';

type TimeFilter = 'hoy' | 'manana' | 'semana' | 'todos';

export const AppointmentsControlPage: React.FC = () => {
  const {
    patients,
    oltpAppointments,
    addOltpAppointment,
    toggleOltpSms,
    updateOltpNoShow,
    rescheduleOltpAppointment,
    deleteOltpAppointment,
    pendingDeltasCount,
    isSyncingEtl,
    syncOltpToDataMart,
    preselectedPatientDni,
    appendSqlLog,
    pushToast,
  } = useClinical();

  // Form states
  const [selectedPatientDni, setSelectedPatientDni] = useState<string>('');
  const [odontologoId, setOdontologoId] = useState<number>(2);
  const [tratamientoCodigo, setTratamientoCodigo] = useState<string>('D3310');
  const [costoAplicado, setCostoAplicado] = useState<string>('250.00');
  const [fechaCita, setFechaCita] = useState<string>('2024-11-30');
  const [smsActivo, setSmsActivo] = useState<boolean>(false);
  const [noShowEstado, setNoShowEstado] = useState<NoShowStatus>('Pendiente');

  // Table filters
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('todos');
  const [dentistFilter, setDentistFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  // Action modals (reschedule / delete)
  const [rescheduleTarget, setRescheduleTarget] = useState<OltpAppointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('2024-11-18');
  const [deleteTarget, setDeleteTarget] = useState<OltpAppointment | null>(null);

  useEffect(() => {
    if (preselectedPatientDni) {
      setSelectedPatientDni(preselectedPatientDni);
    }
  }, [preselectedPatientDni]);

  const nextIdCita = `CT-2024-${1104 + oltpAppointments.length}`;

  const [apiScore, setApiScore] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.idPaciente === selectedPatientDni) || null,
    [patients, selectedPatientDni]
  );

  const diasEspera = useMemo(() => {
    const base = new Date('2024-11-12T00:00:00');
    const target = new Date(`${fechaCita}T00:00:00`);
    const diff = Math.ceil((target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
    return Number.isNaN(diff) ? 0 : diff;
  }, [fechaCita]);

  useEffect(() => {
    const edad = selectedPatient?.edad ?? 29;
    const genero = selectedPatient?.genero ?? 'F';
    const distrito = selectedPatient?.barrio ?? 'Miraflores';
    const clampedDays = Math.max(0, diasEspera);

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await clinicalApi.predictEnVivo({
          edad,
          genero,
          tratamientoCodigo,
          diasEspera: clampedDays,
          distrito,
          smsRecibido: smsActivo,
        });
        if (!cancelled && typeof res?.probabilidad === 'number') {
          setApiScore(res.probabilidad);
        }
      } catch {
        if (!cancelled) setApiScore(null);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedPatient, tratamientoCodigo, diasEspera, smsActivo]);

  const riskModel = useMemo(() => {
    const edad = selectedPatient?.edad ?? 29;
    const clampedDays = Math.max(0, diasEspera);
    const localScore = computeNoShowProbability({
      diasEspera: clampedDays,
      edad,
      smsRecibido: smsActivo,
    });
    const score = apiScore ?? localScore;

    // Semi-circle circumference ~201
    const dashOffset = Math.round(201 - (score / 100) * 201);
    const waitShap = Math.min(45, Math.round(clampedDays * 1.8));
    const ageShap = edad < 25 ? 11.4 : edad > 55 ? -4.2 : 6.8;

    return {
      score,
      edad,
      clampedDays,
      dashOffset,
      waitShap,
      ageShap,
      level: score >= 45 ? 'high' : score >= 25 ? 'medium' : 'low',
    };
  }, [selectedPatient, diasEspera, smsActivo, apiScore]);

  const filteredAppointments = useMemo(() => {
    return oltpAppointments.filter((a) => {
      const matchTime =
        timeFilter === 'todos' ||
        a.bucketTiempo === timeFilter ||
        (timeFilter === 'semana' && (a.bucketTiempo === 'hoy' || a.bucketTiempo === 'manana' || a.bucketTiempo === 'semana'));
      const matchDentist =
        dentistFilter === 'todos' || a.odontologoNombre.includes(dentistFilter);
      const matchStatus = statusFilter === 'todos' || a.noShow === statusFilter;
      return matchTime && matchDentist && matchStatus;
    });
  }, [oltpAppointments, timeFilter, dentistFilter, statusFilter]);

  const handleTreatmentChange = (code: string) => {
    setTratamientoCodigo(code);
    const t = TREATMENTS.find((item) => item.codigo === code);
    if (t) {
      setCostoAplicado(t.costo.toFixed(2));
      appendSqlLog(
        'CPMS_CATALOG',
        `Catálogo CPMS seleccionado: ${t.codigo} -> Costo establecido a S/ ${t.costo.toFixed(2)}`,
        'info'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!selectedPatientDni) {
      pushToast('Paciente Requerido', 'Seleccione un paciente de oltp.Pacientes o cargue el paciente demo.', 'warning');
      return;
    }
    if (diasEspera < 0) {
      pushToast('Fecha Inválida', 'La fecha de la cita no puede ser anterior a la emisión.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await addOltpAppointment({
        idPaciente: selectedPatientDni,
        odontologoId,
        tratamientoCodigo,
        costo: parseFloat(costoAplicado) || 250,
        fechaCita,
        smsRecibido: smsActivo ? 1 : 0,
        noShow: noShowEstado,
        probabilidad: riskModel.score,
      });

      setSelectedPatientDni('');
      setSmsActivo(false);
      setNoShowEstado('Pendiente');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyPrescribedDate = () => {
    setFechaCita('2024-11-14');
    appendSqlLog('PRESCRIPTION', 'Prescripción IA aplicada: FechaCita adelantada a 2024-11-14.', 'info');
  };

  const handleActivateRecommendedSms = () => {
    setSmsActivo(true);
    appendSqlLog('PRESCRIPTION', 'Prescripción IA aplicada: Switch SMSRecibido forzado a BIT 1.', 'info');
  };

  const handleDirectSms = async (appt: OltpAppointment) => {
    appendSqlLog('SMS_GATEWAY', `EXEC oltp.usp_EnviarConfirmacionSMS @IdCita = '${appt.idCita}';`, 'cmd');
    appendSqlLog('SMS_OK', 'Notificación push/SMS transmitida a la pasarela de mensajería.', 'success');
    if (appt.smsRecibido === 0) {
      await toggleOltpSms(appt.idCita);
    } else {
      pushToast('SMS Enviado', `Recordatorio reenviado al paciente para la cita ${appt.idCita}.`);
    }
  };

  return (
    <div className="flex flex-col w-full gap-5">
      {/* CABECERA CON CTA DE SINCRONIZACIÓN ETL */}
      <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-surface-container-lowest p-5 lg:p-6 rounded-xl shadow-sm relative overflow-hidden">
        <div className="flex flex-col gap-1 min-w-0 z-10">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container text-primary font-label-sm uppercase tracking-wider font-semibold">
              <span className="material-symbols-outlined text-[14px]">bolt</span>
              Inferencia Activa v2.4
            </span>
            <span className="text-on-surface-variant font-code-sm">
              oltp.Citas → dm.Fact_Atenciones
            </span>
          </div>
          <h1 className="font-headline-md text-on-surface tracking-tight">
            Agendamiento y Control de Citas — oltp.Citas con Inferencia IA
          </h1>
          <p className="font-body-md text-on-surface-variant max-w-3xl">
            Recepción operativa y control de inasistencia en tiempo real conectado al pipeline transaccional y dimensional.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 z-10 shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-low text-on-surface-variant font-code-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="font-medium text-on-surface">{pendingDeltasCount} deltas OLTP en cola</span>
          </div>
          <button
            type="button"
            disabled={isSyncingEtl}
            onClick={syncOltpToDataMart}
            className="flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-label-md shadow-md transition-all active:scale-95 text-left disabled:opacity-70"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container-lowest/15 text-on-primary shrink-0">
              <span className={`material-symbols-outlined text-[20px] ${isSyncingEtl ? 'animate-spin' : ''}`}>
                cloud_sync
              </span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-semibold tracking-wide flex items-center gap-1.5">
                Sincronizar con Data Mart
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-[10px]">
                  Ejecutar
                </span>
              </span>
              <span className="font-label-sm text-[11px] text-surface-container-high opacity-90">
                ETL usp_ETL_CargarDataMart + Scoring IA
              </span>
            </div>
          </button>
        </div>
      </section>

      {/* FORMULARIO OLTP + ASISTENTE PREDICTIVO IA */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Formulario (7 cols) */}
        <div className="lg:col-span-7 bg-surface-container-lowest p-5 lg:p-6 rounded-xl shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary-fixed flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">calendar_add_on</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-on-surface font-semibold">
                  Registro de Cita Odontológica
                </h2>
                <p className="font-body-sm text-on-surface-variant">
                  Inserción atómica directa en tabla oltp.Citas
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-label-sm text-on-surface-variant uppercase tracking-wider">
                Identificador Cita
              </span>
              <span className="font-code-md text-primary font-bold px-2 py-0.5 bg-surface-container rounded-lg">
                {nextIdCita}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-on-surface font-semibold flex items-center justify-between">
                <span>Paciente (oltp.Pacientes)</span>
                <button
                  type="button"
                  onClick={() => setSelectedPatientDni(patients[4]?.idPaciente || patients[0]?.idPaciente || '')}
                  className="text-primary font-code-sm font-normal hover:underline"
                >
                  Cargar Paciente Demo
                </button>
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-on-surface-variant">
                  person_search
                </span>
                <select
                  value={selectedPatientDni}
                  onChange={(e) => setSelectedPatientDni(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low rounded-lg font-body-md text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none transition-all"
                >
                  <option value="" disabled>
                    Seleccione o busque por DNI / Apellidos...
                  </option>
                  {patients.map((p) => (
                    <option key={p.idPaciente} value={p.idPaciente}>
                      {p.idPaciente} — {p.nombre} ({p.edad} años, {p.barrio})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface font-semibold">
                  Odontólogo Especialista
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-on-surface-variant">
                    stethoscope
                  </span>
                  <select
                    value={odontologoId}
                    onChange={(e) => setOdontologoId(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low rounded-lg font-body-md text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {DENTISTS.slice(0, 3).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.id} — {d.nombre} ({d.especialidad})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface font-semibold">
                  Tratamiento CPMS (oltp.Tratamientos)
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-on-surface-variant">
                    medical_services
                  </span>
                  <select
                    value={tratamientoCodigo}
                    onChange={(e) => handleTreatmentChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-surface-container-low rounded-lg font-body-md text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {TREATMENTS.slice(0, 5).map((t) => (
                      <option key={t.codigo} value={t.codigo}>
                        {t.codigo} — {t.nombre} (S/ {t.costo.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface font-semibold">
                  Costo Aplicado (DECIMAL)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 font-code-md text-on-surface-variant font-bold">
                    S/
                  </span>
                  <input
                    type="number"
                    step="0.50"
                    value={costoAplicado}
                    onChange={(e) => setCostoAplicado(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-surface-container font-code-md text-on-surface rounded-lg font-bold focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  Catálogo CPMS actualizado
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface font-semibold">
                  Fecha Programación
                </label>
                <input
                  type="text"
                  readOnly
                  value="2024-11-12 10:30"
                  className="w-full px-3 py-2 bg-surface-container-low font-code-sm text-on-surface-variant rounded-lg cursor-not-allowed"
                />
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  DATETIME2 (Captura de sistema)
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-label-sm text-on-surface font-semibold flex items-center justify-between">
                  <span>Fecha de la Cita</span>
                  {diasEspera < 0 && <span className="text-error text-[10px]">Inválida</span>}
                </label>
                <input
                  type="date"
                  min="2024-11-12"
                  value={fechaCita}
                  onChange={(e) => setFechaCita(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-surface-container-low font-code-md text-on-surface rounded-lg focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <span
                  className={`font-label-sm text-[11px] font-semibold ${
                    diasEspera < 0 ? 'text-error' : 'text-primary'
                  }`}
                >
                  {diasEspera < 0
                    ? 'Error: Fecha anterior a la emisión'
                    : `Espera proyectada: ${diasEspera} días`}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-surface-container-low rounded-xl">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-label-md text-on-surface font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-primary">sms</span>
                    SMS Notificación (BIT)
                  </span>
                  <span className="font-body-sm text-on-surface-variant">
                    Dispara recordatorio automatizado
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

              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-label-md text-on-surface font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-secondary">
                      event_available
                    </span>
                    Estado Inicial NoShow
                  </span>
                  <span className="font-body-sm text-on-surface-variant">
                    Default: Pendiente de asistencia
                  </span>
                </div>
                <select
                  value={noShowEstado}
                  onChange={(e) => setNoShowEstado(e.target.value as NoShowStatus)}
                  className="px-3 py-1.5 bg-surface-container-lowest rounded-lg font-label-md text-on-surface focus:ring-1 focus:ring-primary focus:outline-none font-medium"
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="No">No (Asistió)</option>
                  <option value="Yes">Yes (Faltó)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedPatientDni('');
                  setTratamientoCodigo('D3310');
                  setCostoAplicado('250.00');
                  setFechaCita('2024-11-30');
                  setSmsActivo(false);
                  setNoShowEstado('Pendiente');
                }}
                className="px-4 py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors font-label-md"
              >
                Limpiar Formulario
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md shadow transition-all disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                <span>{isSubmitting ? 'Registrando...' : 'Registrar Cita en oltp.Citas'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Asistente Predictivo (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-lg bg-secondary-container text-on-secondary-container">
                  <span className="material-symbols-outlined text-[20px]">psychology</span>
                </span>
                <div>
                  <h3 className="font-headline-sm text-on-surface font-semibold">
                    Asistente Predictivo No-Show
                  </h3>
                  <p className="font-body-sm text-on-surface-variant">
                    Random Forest v2.4 (F1: 0.84)
                  </p>
                </div>
              </div>
              <span className="font-code-sm px-2 py-0.5 rounded-full bg-surface-container text-primary font-medium whitespace-nowrap">
                Inferencia &lt;12ms
              </span>
            </div>

            {/* Semi-circular Gauge */}
            <div className="flex flex-col items-center justify-center p-3 bg-surface-container-low rounded-xl">
              <div className="relative w-44 h-28 flex items-end justify-center overflow-hidden">
                <svg className="w-44 h-44 transform -rotate-90 origin-center" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    fill="none"
                    r="64"
                    stroke="#dce9ff"
                    strokeDasharray="201 400"
                    strokeLinecap="round"
                    strokeWidth="14"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    fill="none"
                    r="64"
                    stroke={
                      riskModel.level === 'high'
                        ? '#ba1a1a'
                        : riskModel.level === 'medium'
                        ? '#d97706'
                        : '#059669'
                    }
                    strokeDasharray="201 400"
                    strokeDashoffset={riskModel.dashOffset}
                    strokeLinecap="round"
                    strokeWidth="14"
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute bottom-1 flex flex-col items-center">
                  <span className="font-display-lg text-on-surface leading-none tracking-tight">
                    {riskModel.score}%
                  </span>
                  <span
                    className={`font-label-sm uppercase font-bold tracking-wider mt-1 ${
                      riskModel.level === 'high'
                        ? 'text-error'
                        : riskModel.level === 'medium'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {riskModel.level === 'high'
                      ? 'RIESGO ALTO'
                      : riskModel.level === 'medium'
                      ? 'RIESGO MODERADO'
                      : 'RIESGO BAJO'}
                  </span>
                </div>
              </div>
              <div className="w-full flex items-center justify-between px-4 pt-1 text-on-surface-variant font-label-sm text-[11px]">
                <span>0% (Óptimo)</span>
                <span>Umbral Crítico: 38%</span>
                <span>100% (Abandono)</span>
              </div>
            </div>

            {riskModel.score >= 25 && (
              <div className="p-4 rounded-xl bg-error-container/40 text-on-surface flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-error">warning</span>
                  <span className="font-headline-sm text-label-md text-error font-bold">
                    Alerta: Espera Crítica ({riskModel.clampedDays} días)
                  </span>
                </div>
                <p className="font-body-sm text-on-surface-variant">
                  La espera supera los 15 días calendario. Estadísticamente triplica la deserción sin confirmación multicanal previa.
                </p>
                <div className="mt-1 flex flex-col gap-1.5">
                  <span className="font-label-sm font-semibold uppercase tracking-wider text-on-surface">
                    Recomendaciones Prescriptivas IA:
                  </span>
                  <div className="flex items-start gap-2 text-on-surface-variant font-body-sm bg-surface-container-lowest/80 p-2 rounded-lg">
                    <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">
                      event_repeat
                    </span>
                    <div className="flex-1">
                      <span>Adelantar fecha a cupo cancelado:</span>
                      <button
                        type="button"
                        onClick={handleApplyPrescribedDate}
                        className="font-semibold text-primary underline ml-1 hover:text-primary-container"
                      >
                        Jueves 14 Nov (11:00 AM)
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-on-surface-variant font-body-sm bg-surface-container-lowest/80 p-2 rounded-lg">
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-emerald-600">
                        mark_chat_read
                      </span>
                      <span>Activar SMS Inmediato (-15% riesgo)</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleActivateRecommendedSms}
                      className="px-2.5 py-0.5 rounded bg-primary text-on-primary font-label-sm"
                    >
                      Activar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mini SHAP */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="font-label-sm uppercase tracking-wider font-semibold text-on-surface-variant">
                  Explicabilidad SHAP (Aportes Locales)
                </span>
                <span className="font-code-sm text-on-surface-variant">Base: 19.4%</span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between font-label-sm text-[11px] text-on-surface mb-0.5">
                    <span>Tiempo de Espera ({riskModel.clampedDays} días)</span>
                    <span className="text-error font-bold font-code-sm">
                      +{riskModel.waitShap.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-error h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(100, riskModel.waitShap * 2)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between font-label-sm text-[11px] text-on-surface mb-0.5">
                    <span>Edad del Paciente ({riskModel.edad} años)</span>
                    <span className="text-amber-600 font-bold font-code-sm">
                      {riskModel.ageShap >= 0 ? `+${riskModel.ageShap.toFixed(1)}%` : `${riskModel.ageShap.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                    <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: '25%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between font-label-sm text-[11px] text-on-surface mb-0.5">
                    <span>
                      {smsActivo ? 'SMS Recordatorio (Activo)' : 'SMS Recordatorio (No enviado)'}
                    </span>
                    <span
                      className={`font-bold font-code-sm ${
                        smsActivo ? 'text-emerald-700' : 'text-error'
                      }`}
                    >
                      {smsActivo ? '-15.0%' : '+18.8%'}
                    </span>
                  </div>
                  <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        smsActivo ? 'bg-emerald-500' : 'bg-error'
                      }`}
                      style={{ width: smsActivo ? '30%' : '40%' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-low p-4 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="font-label-sm text-on-surface">
                Transacción Atómica OLTP Lista
              </span>
            </div>
            <span className="font-code-sm text-primary font-semibold">
              ISOLATION: READ COMMITTED
            </span>
          </div>
        </div>
      </section>

      {/* BANDEJA OPERATIVA DE CITAS */}
      <section className="bg-surface-container-lowest p-5 lg:p-6 rounded-xl shadow-sm flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-on-surface font-semibold">
                Bandeja Operativa de Citas (oltp.Citas)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm font-bold text-primary">
                {filteredAppointments.length} Citas en Vista
              </span>
            </div>
            <span className="font-body-sm text-on-surface-variant">
              Gestión directa de estado de asistencia y despacho SMS en tiempo real
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-surface-container-low p-1 rounded-xl">
              {(
                [
                  { id: 'hoy', label: 'Hoy' },
                  { id: 'manana', label: 'Mañana' },
                  { id: 'semana', label: 'Esta Semana' },
                  { id: 'todos', label: 'Todas' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTimeFilter(t.id)}
                  className={`px-3 py-1 rounded-lg font-label-sm transition-colors ${
                    timeFilter === t.id
                      ? 'bg-surface-container-lowest text-primary shadow-sm font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <select
              value={dentistFilter}
              onChange={(e) => setDentistFilter(e.target.value)}
              className="px-3 py-1.5 bg-surface-container-low rounded-xl font-label-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="todos">Todos los Odontólogos</option>
              <option value="Carlos Mendoza">Dr. Carlos Mendoza</option>
              <option value="Lucía Paredes">Dra. Lucía Paredes</option>
              <option value="Jorge Salas">Dr. Jorge Salas</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-surface-container-low rounded-xl font-label-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="todos">Estado: Todos</option>
              <option value="Pendiente">Solo Pendientes</option>
              <option value="No">Asistieron (No)</option>
              <option value="Yes">Faltaron (Yes)</option>
            </select>
          </div>
        </div>

        <div className="w-full overflow-x-auto rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant font-label-sm uppercase tracking-wider">
                <th className="py-3 px-3">IdCita</th>
                <th className="py-3 px-3">Paciente (DNI &amp; Distrito)</th>
                <th className="py-3 px-3">Odontólogo / Sillón</th>
                <th className="py-3 px-3">Tratamiento CPMS</th>
                <th className="py-3 px-3">Fecha &amp; Hora</th>
                <th className="py-3 px-3 text-center">Espera</th>
                <th className="py-3 px-3 text-center">SMS Notif.</th>
                <th className="py-3 px-3 text-center">Estado Asistencia</th>
                <th className="py-3 px-3 text-right">Acciones Rápidas (OLTP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container font-body-sm text-on-surface">
              {filteredAppointments.map((a) => (
                <tr key={a.idCita} className="hover:bg-surface-container-low/60 transition-colors">
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="font-code-sm text-primary font-bold px-2 py-0.5 bg-surface-container rounded">
                      {a.idCita}
                    </span>
                  </td>

                  <td className="py-2.5 px-3">
                    <div className="flex flex-col">
                      <span className="font-semibold text-on-surface">{a.pacienteNombre}</span>
                      <span className="font-code-sm text-on-surface-variant">
                        {a.idPaciente} • {a.distrito} ({a.edad}a)
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-medium">{a.odontologoNombre}</span>
                      <span className="font-label-sm text-[11px] text-on-surface-variant">
                        {a.sillon}
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-medium text-on-surface">
                        {a.tratamientoCodigo} — {a.tratamientoNombre}
                      </span>
                      <span className="font-code-sm text-primary font-bold">
                        S/ {a.costo.toFixed(2)}
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className="font-code-sm">
                      {a.fechaCita} {a.hora}
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded-full font-code-sm font-semibold ${
                        a.tiempoEspera > 14
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container text-on-surface'
                      }`}
                    >
                      {a.tiempoEspera}d
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleOltpSms(a.idCita)}
                      title="Click para alternar BIT"
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-label-sm transition-all ${
                        a.smsRecibido === 1
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-surface-container text-on-surface-variant hover:bg-primary hover:text-on-primary'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {a.smsRecibido === 1 ? 'done_all' : 'sms_failed'}
                      </span>
                      <span>{a.smsRecibido === 1 ? '1 Enviado' : '0 Pendiente'}</span>
                    </button>
                  </td>

                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <select
                      value={a.noShow}
                      onChange={(e) => updateOltpNoShow(a.idCita, e.target.value as NoShowStatus)}
                      className={`px-2.5 py-1 rounded-lg font-label-sm font-medium focus:outline-none ${
                        a.noShow === 'No'
                          ? 'bg-emerald-100 text-emerald-800'
                          : a.noShow === 'Yes'
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container text-on-surface'
                      }`}
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="No">No (Asistió)</option>
                      <option value="Yes">Yes (Faltó)</option>
                    </select>
                  </td>

                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDirectSms(a)}
                        title="Enviar y Confirmar SMS"
                        className="p-1.5 rounded hover:bg-surface-container text-primary"
                      >
                        <span className="material-symbols-outlined text-[18px]">send</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRescheduleTarget(a);
                          setRescheduleDate(a.fechaCita);
                        }}
                        title="Reprogramar Fecha (Update)"
                        className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(a)}
                        title="Cancelar Cita (Delete)"
                        className="p-1.5 rounded hover:bg-error-container text-error"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CONSOLE */}
      <SqlConsole title="Consola de Telemetría Write-Back & Pipeline T-SQL" variant="compact" />

      {/* RESCHEDULE MODAL */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface-container-lowest p-6 rounded-xl shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-sm text-on-surface">
                Reprogramar Cita {rescheduleTarget.idCita}
              </h3>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <p className="font-body-sm text-on-surface-variant">
              Paciente: <strong className="text-on-surface">{rescheduleTarget.pacienteNombre}</strong>
            </p>
            <div className="flex flex-col gap-1">
              <label className="font-label-sm font-semibold text-on-surface">
                Nueva Fecha de Cita
              </label>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-container-low font-code-md text-on-surface"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label-md"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = rescheduleTarget.idCita;
                  setRescheduleTarget(null);
                  await rescheduleOltpAppointment(targetId, rescheduleDate);
                }}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md"
              >
                Guardar Nueva Fecha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface-container-lowest p-6 rounded-xl shadow-xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-error">
              <div className="w-10 h-10 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">delete_forever</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-on-surface">
                  Cancelar Cita {deleteTarget.idCita}
                </h3>
                <span className="font-code-sm text-on-surface-variant">DELETE FROM oltp.Citas</span>
              </div>
            </div>
            <p className="font-body-md text-on-surface-variant">
              ¿Confirma la cancelación física de la cita de{' '}
              <strong className="text-on-surface">{deleteTarget.pacienteNombre}</strong>?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label-md"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = deleteTarget.idCita;
                  setDeleteTarget(null);
                  await deleteOltpAppointment(targetId);
                }}
                className="px-4 py-2 rounded-lg bg-error text-on-error font-label-md"
              >
                Confirmar Cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
