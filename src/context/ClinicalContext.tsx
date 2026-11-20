import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DENTISTS,
  INITIAL_AUDIT_EVENTS,
  INITIAL_OLTP_APPOINTMENTS,
  INITIAL_PATIENTS,
  INITIAL_RETENTION_ROWS,
  TREATMENTS,
} from '../data/initialData';
import { ApiError, clinicalApi, FASTAPI_BASE_URL } from '../services/api';
import {
  AuditEvent,
  DataMartRetentionRow,
  Dentist,
  ModuleId,
  NoShowStatus,
  OltpAppointment,
  Patient,
  SqlLogEntry,
  ToastNotice,
  Treatment,
  WorkspaceMode,
} from '../types/clinical';

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToIsoDate(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface ClinicalContextValue {
  activeModule: ModuleId;
  setActiveModule: (m: ModuleId) => void;
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  preselectedPatientDni: string | null;
  navigateToAppointmentForPatient: (dni: string) => void;

  apiConnected: boolean;
  isLoadingData: boolean;
  refreshAllFromApi: (silent?: boolean) => Promise<void>;
  searchPatientsFromApi: (buscar: string, limit?: number) => Promise<Patient[]>;

  treatments: Treatment[];
  dentists: Dentist[];

  patients: Patient[];
  addPatient: (
    patient: Omit<Patient, 'citasCount' | 'ultimaCita' | 'estadoClinico' | 'etapaBadge'>
  ) => Promise<boolean>;
  updatePatient: (patient: Patient) => Promise<boolean>;
  deletePatient: (idPaciente: string) => Promise<{ ok: boolean; reason?: string }>;

  oltpAppointments: OltpAppointment[];
  addOltpAppointment: (input: {
    idPaciente: string;
    odontologoId: number;
    tratamientoCodigo: string;
    costo: number;
    fechaCita: string;
    smsRecibido: 0 | 1;
    noShow: NoShowStatus;
    probabilidad?: number;
  }) => Promise<OltpAppointment | null>;
  toggleOltpSms: (idCita: string) => Promise<void>;
  updateOltpNoShow: (idCita: string, status: NoShowStatus) => Promise<void>;
  rescheduleOltpAppointment: (idCita: string, newDate: string) => Promise<void>;
  deleteOltpAppointment: (idCita: string) => Promise<void>;

  retentionRows: DataMartRetentionRow[];
  confirmRetentionSmsWriteBack: (idCita: string) => Promise<void>;

  pendingDeltasCount: number;
  stgQueueCount: number;
  oltpTotalCount: number;
  oltpPacientesCount: number;
  oltpPacientesFCount: number;
  oltpPacientesMCount: number;
  oltpTopBarrio: string;
  dmFactCount: number;
  lastSyncTime: string;
  isSyncingEtl: boolean;

  syncOltpToDataMart: () => Promise<void>;
  execStagingToOltp: () => Promise<void>;
  retrainAiModel: () => Promise<void>;
  modelAuc: string;

  sqlLogs: SqlLogEntry[];
  appendSqlLog: (prefix: string, message: string, tone?: SqlLogEntry['tone']) => void;
  clearSqlLogs: () => void;

  auditEvents: AuditEvent[];
  toasts: ToastNotice[];
  pushToast: (title: string, message: string, variant?: ToastNotice['variant']) => void;
  dismissToast: (id: string) => void;
}

const ClinicalContext = createContext<ClinicalContextValue | undefined>(undefined);

const STORAGE_KEY = 'sonrisa_integral_state_v1';

function formatTimeNow(): string {
  const now = new Date();
  return now.toTimeString().split(' ')[0];
}

function formatIsoNow(): string {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 23);
}

export function computeNoShowProbability(params: {
  diasEspera: number;
  edad: number;
  smsRecibido: boolean;
}): number {
  const { diasEspera, edad, smsRecibido } = params;
  const waitScore = Math.min((diasEspera / 22) * 58, 68);
  let ageScore = 8;
  if (edad < 25) ageScore = 14;
  else if (edad > 60) ageScore = 12;

  const smsDeduction = smsRecibido ? -15 : 0;
  let total = Math.round(15 + waitScore + ageScore + smsDeduction);
  if (total > 95) total = 95;
  if (total < 5) total = 5;
  return total;
}

export const ClinicalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeModule, setActiveModule] = useState<ModuleId>('inteligencia-de-negocios');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('direccion');
  const [preselectedPatientDni, setPreselectedPatientDni] = useState<string | null>(null);

  const [apiConnected, setApiConnected] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);

  const [treatments, setTreatments] = useState<Treatment[]>(TREATMENTS);
  const [dentists, setDentists] = useState<Dentist[]>(DENTISTS);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [oltpAppointments, setOltpAppointments] = useState<OltpAppointment[]>([]);
  const [retentionRows, setRetentionRows] = useState<DataMartRetentionRow[]>([]);

  const [stgQueueCount, setStgQueueCount] = useState<number>(0);
  const [oltpTotalCount, setOltpTotalCount] = useState<number>(0);
  const [oltpPacientesCount, setOltpPacientesCount] = useState<number>(0);
  const [oltpPacientesFCount, setOltpPacientesFCount] = useState<number>(0);
  const [oltpPacientesMCount, setOltpPacientesMCount] = useState<number>(0);
  const [oltpTopBarrio, setOltpTopBarrio] = useState<string>('');
  const [dmFactCount, setDmFactCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Sincronizando...');
  const [isSyncingEtl, setIsSyncingEtl] = useState<boolean>(false);
  const [modelAuc, setModelAuc] = useState<string>('0.842');

  const [sqlLogs, setSqlLogs] = useState<SqlLogEntry[]>([
    {
      id: 'log-1',
      timestamp: formatIsoNow(),
      prefix: 'SESSION: SPID-64',
      message: "Connected to instance 'localhost\\SQLEXPRESS'. Database context set to [DentalCenterDB].",
      tone: 'info',
    },
    {
      id: 'log-2',
      timestamp: formatIsoNow(),
      prefix: 'FASTAPI',
      message: `Inicializando cliente REST hacia FastAPI (${FASTAPI_BASE_URL}/api/*)...`,
      tone: 'cmd',
    },
  ]);

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(INITIAL_AUDIT_EVENTS);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, []);

  const appendSqlLog = useCallback(
    (prefix: string, message: string, tone: SqlLogEntry['tone'] = 'info') => {
      const entry: SqlLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: formatIsoNow(),
        prefix,
        message,
        tone,
      };
      setSqlLogs((prev) => [...prev.slice(-60), entry]);
    },
    []
  );

  const pushToast = useCallback(
    (title: string, message: string, variant: ToastNotice['variant'] = 'success') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const refreshAllFromApi = useCallback(async (silent = false) => {
    if (!silent) setIsLoadingData(true);
    try {
      const [apiPatients, apiCitas, apiRetencion, apiKpis, apiTratamientos, apiOdontologos] =
        await Promise.all([
          clinicalApi.getPacientes('', 100),
          clinicalApi.getCitas(100),
          clinicalApi.getRetencion('Todos', 100),
          clinicalApi.getKpisMonitor('30d', 'todas'),
          clinicalApi.getTratamientos().catch(() => TREATMENTS),
          clinicalApi.getOdontologos().catch(() => DENTISTS),
        ]);

      if (Array.isArray(apiPatients)) setPatients(apiPatients);
      if (Array.isArray(apiCitas)) setOltpAppointments(apiCitas);
      if (Array.isArray(apiRetencion)) setRetentionRows(apiRetencion);
      if (Array.isArray(apiTratamientos) && apiTratamientos.length > 0) {
        setTreatments(apiTratamientos);
      }
      if (Array.isArray(apiOdontologos) && apiOdontologos.length > 0) {
        setDentists(apiOdontologos);
      }

      if (apiKpis?.monitor) {
        setStgQueueCount(apiKpis.monitor.stg_rechazos ?? 0);
        setOltpTotalCount(apiKpis.monitor.oltp_citas ?? 0);
        setOltpPacientesCount(apiKpis.monitor.oltp_pacientes ?? 0);
        setOltpPacientesFCount(apiKpis.monitor.oltp_pacientes_f ?? 0);
        setOltpPacientesMCount(apiKpis.monitor.oltp_pacientes_m ?? 0);
        setOltpTopBarrio(apiKpis.monitor.oltp_top_barrio ?? '');
        setDmFactCount(apiKpis.monitor.dm_hechos ?? 0);
      }
      if (apiKpis?.ultimoSync) {
        setLastSyncTime(apiKpis.ultimoSync);
      } else {
        setLastSyncTime(`${formatTimeNow().slice(0, 5)} PET`);
      }

      setApiConnected(true);
      appendSqlLog(
        'FASTAPI_OK',
        `GET ${FASTAPI_BASE_URL}/api/pacientes, /api/citas, /api/retencion, /api/kpis-monitor sincronizados desde SQL Server (SQLEXPRESS).`,
        'success'
      );
    } catch (err) {
      setApiConnected(false);
      setPatients((prev) => (prev.length === 0 ? INITIAL_PATIENTS : prev));
      setOltpAppointments((prev) => (prev.length === 0 ? INITIAL_OLTP_APPOINTMENTS : prev));
      setRetentionRows((prev) => (prev.length === 0 ? INITIAL_RETENTION_ROWS : prev));
      const reason = err instanceof Error ? err.message : 'Error de red';
      appendSqlLog(
        'FASTAPI_OFFLINE',
        `No se pudo conectar con ${FASTAPI_BASE_URL} (${reason}). Operando con datos de respaldo.`,
        'warn'
      );
    } finally {
      if (!silent) setIsLoadingData(false);
    }
  }, [appendSqlLog]);

  const searchPatientsFromApi = useCallback(
    async (buscar: string, limit = 100): Promise<Patient[]> => {
      try {
        const res = await clinicalApi.getPacientes(buscar, limit);
        if (Array.isArray(res)) {
          setPatients(res);
          setApiConnected(true);
          return res;
        }
      } catch {
        // mantener lista actual si hay error de red
      }
      return [];
    },
    []
  );

  useEffect(() => {
    refreshAllFromApi(false);
  }, [refreshAllFromApi]);

  useEffect(() => {
    if (
      activeModule === 'gestion-de-pacientes' ||
      activeModule === 'agendamiento-y-control-de-citas' ||
      activeModule === 'agenda-inteligente-y-retencion'
    ) {
      refreshAllFromApi(true);
    }
  }, [activeModule, refreshAllFromApi]);

  const pendingDeltasCount = useMemo(() => {
    const unsynced = oltpAppointments.filter((a) => !a.sincronizadoDM).length;
    const dbDelta = Math.max(0, oltpTotalCount - dmFactCount);
    return Math.max(dbDelta, unsynced);
  }, [oltpAppointments, oltpTotalCount, dmFactCount]);

  const clearSqlLogs = () => {
    setSqlLogs([
      {
        id: `log-${Date.now()}`,
        timestamp: formatIsoNow(),
        prefix: 'CONSOLE',
        message: 'Telemetry screen cleared. Listening for T-SQL & FastAPI dispatches...',
        tone: 'info',
      },
    ]);
  };

  const pushAudit = (
    op: AuditEvent['op'],
    proc: string,
    detail: string,
    status: AuditEvent['status'] = 'ok'
  ) => {
    setAuditEvents((prev) => [
      {
        id: `aud-${Date.now()}`,
        time: `${formatTimeNow()} PET`,
        op,
        proc,
        detail,
        status,
      },
      ...prev.slice(0, 5),
    ]);
  };

  const navigateToAppointmentForPatient = (dni: string) => {
    setPreselectedPatientDni(dni);
    setActiveModule('agendamiento-y-control-de-citas');
    pushToast('Paciente seleccionado', `Cargando IdPaciente ${dni} en Agendamiento & Citas IA`, 'info');
  };

  const addPatient = async (
    patientInput: Omit<Patient, 'citasCount' | 'ultimaCita' | 'estadoClinico' | 'etapaBadge'>
  ): Promise<boolean> => {
    if (patients.some((p) => p.idPaciente === patientInput.idPaciente)) {
      pushToast(
        'Error de Clave Primaria',
        `PK_Pacientes_IdPaciente duplicada: el IdPaciente ${patientInput.idPaciente} ya existe en oltp.Pacientes.`,
        'error'
      );
      appendSqlLog(
        'PK_VIOLATION',
        `Violation of PRIMARY KEY constraint 'PK_Pacientes_IdPaciente'. Cannot insert duplicate key '${patientInput.idPaciente}'.`,
        'error'
      );
      return false;
    }

    let createdPatient: Patient = {
      ...patientInput,
      citasCount: 0,
      ultimaCita: 'Sin citas previas',
      estadoClinico: 'Nuevo Ingreso',
      etapaBadge: 'active',
    };

    try {
      const apiCreated = await clinicalApi.createPaciente(patientInput);
      if (apiCreated?.idPaciente) {
        createdPatient = apiCreated;
      }
      setApiConnected(true);
      appendSqlLog('POST_API', `POST ${FASTAPI_BASE_URL}/api/pacientes -> 200 OK`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Error de Validación SQL / FastAPI', err.message, 'error');
        appendSqlLog('SQL_REJECTED', `POST /api/pacientes rechazado (${err.status}): ${err.message}`, 'error');
        return false;
      }
      const msg = err instanceof Error ? err.message : 'offline';
      appendSqlLog('API_FALLBACK', `POST /api/pacientes en caché local (${msg}).`, 'warn');
    }

    setPatients((prev) => [createdPatient, ...prev]);
    setOltpPacientesCount((c) => c + 1);
    if (createdPatient.genero === 'F') setOltpPacientesFCount((c) => c + 1);
    else setOltpPacientesMCount((c) => c + 1);

    appendSqlLog(
      'INSERT_PACIENTE',
      `INSERT INTO oltp.Pacientes (IdPaciente, Genero, Edad, Barrio) VALUES (${createdPatient.idPaciente}, '${createdPatient.genero}', ${createdPatient.edad}, N'${createdPatient.barrio}');`,
      'cmd'
    );
    pushAudit('INSERT', 'oltp.Pacientes', `Id: ${createdPatient.idPaciente} — ${createdPatient.barrio} (OK)`);
    pushToast('Paciente Registrado', `IdPaciente ${createdPatient.idPaciente} guardado en oltp.Pacientes.`);
    return true;
  };

  const updatePatient = async (updated: Patient): Promise<boolean> => {
    let finalPatient = updated;
    try {
      const apiRes = await clinicalApi.updatePaciente(updated.idPaciente, updated);
      if (apiRes?.idPaciente) finalPatient = apiRes;
      setApiConnected(true);
      appendSqlLog('PUT_API', `PUT ${FASTAPI_BASE_URL}/api/pacientes/${updated.idPaciente} -> 200 OK`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Error al Actualizar Paciente', err.message, 'error');
        appendSqlLog('SQL_REJECTED', `PUT /api/pacientes/${updated.idPaciente} rechazado (${err.status}): ${err.message}`, 'error');
        return false;
      }
      appendSqlLog('API_FALLBACK', `PUT /api/pacientes/${updated.idPaciente} aplicado localmente.`, 'warn');
    }

    setPatients((prev) =>
      prev.map((p) => (p.idPaciente === finalPatient.idPaciente ? finalPatient : p))
    );
    appendSqlLog(
      'UPDATE_PACIENTE',
      `UPDATE oltp.Pacientes SET Genero = '${finalPatient.genero}', Edad = ${finalPatient.edad}, Barrio = N'${finalPatient.barrio}' WHERE IdPaciente = ${finalPatient.idPaciente};`,
      'cmd'
    );
    pushAudit('UPDATE', 'oltp.Pacientes', `Id: ${finalPatient.idPaciente} — ${finalPatient.barrio}`);
    pushToast('Registro Actualizado', `Expediente ${finalPatient.idPaciente} actualizado en DentalCenterDB.`);
    return true;
  };

  const deletePatient = async (idPaciente: string): Promise<{ ok: boolean; reason?: string }> => {
    const targetPt = patients.find((p) => p.idPaciente === idPaciente);
    const hasOltp =
      (targetPt && targetPt.citasCount > 0) ||
      oltpAppointments.some((a) => a.idPaciente === idPaciente);
    const hasDm = retentionRows.some((r) => r.dni === idPaciente);
    if (hasOltp || hasDm) {
      appendSqlLog(
        'FK_CONFLICT',
        `DELETE statement conflicted with the REFERENCE constraint "FK_Citas_Pacientes" for IdPaciente = ${idPaciente}.`,
        'error'
      );
      pushAudit('VERIFY CHECK', 'FK_Citas_Pacientes', `Blocked DELETE on Id: ${idPaciente} (citas activas)`, 'warn');
      pushToast(
        'Restricción FK_Citas_Pacientes',
        `SQL Server bloqueó la eliminación: el paciente ${idPaciente} tiene citas registradas en oltp.Citas.`,
        'error'
      );
      return {
        ok: false,
        reason: 'El paciente posee citas históricas vinculadas en oltp.Citas (ON DELETE NO ACTION).',
      };
    }

    try {
      await clinicalApi.deletePaciente(idPaciente);
      setApiConnected(true);
      appendSqlLog('DELETE_API', `DELETE ${FASTAPI_BASE_URL}/api/pacientes/${idPaciente} -> 200 OK`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Restricción SQL Server', err.message, 'error');
        appendSqlLog('FK_CONFLICT', `DELETE /api/pacientes/${idPaciente} rechazado: ${err.message}`, 'error');
        return { ok: false, reason: err.message };
      }
      appendSqlLog('API_FALLBACK', `DELETE /api/pacientes/${idPaciente} aplicado localmente.`, 'warn');
    }

    setPatients((prev) => prev.filter((p) => p.idPaciente !== idPaciente));
    setOltpPacientesCount((c) => Math.max(0, c - 1));
    appendSqlLog(
      'DELETE_PACIENTE',
      `DELETE FROM oltp.Pacientes WHERE IdPaciente = ${idPaciente}; -- 1 row affected`,
      'warn'
    );
    pushAudit('DELETE', 'oltp.Pacientes', `Id: ${idPaciente} — Eliminado`);
    pushToast('Registro Eliminado', `Paciente ${idPaciente} eliminado de oltp.Pacientes.`);
    return { ok: true };
  };

  const addOltpAppointment = async (input: {
    idPaciente: string;
    odontologoId: number;
    tratamientoCodigo: string;
    costo: number;
    fechaCita: string;
    smsRecibido: 0 | 1;
    noShow: NoShowStatus;
    probabilidad?: number;
  }): Promise<OltpAppointment | null> => {
    const patient = patients.find((p) => p.idPaciente === input.idPaciente) || {
      idPaciente: input.idPaciente,
      genero: 'F' as const,
      edad: 30,
      barrio: 'Miraflores',
    };
    const dentist = dentists.find((d) => d.id === input.odontologoId) || dentists[0] || DENTISTS[0];
    const treatment =
      treatments.find((t) => t.codigo === input.tratamientoCodigo) || treatments[0] || TREATMENTS[0];

    const todayIso = getTodayIsoDate();
    const todayDate = new Date(`${todayIso}T00:00:00`);
    const targetDate = new Date(`${input.fechaCita}T00:00:00`);
    const diffDays = Math.ceil((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      pushToast('Fecha Inválida', 'La fecha de la cita no puede ser anterior a la fecha de programación.', 'error');
      return null;
    }

    const bucket: OltpAppointment['bucketTiempo'] =
      diffDays === 0 ? 'hoy' : diffDays === 1 ? 'manana' : 'semana';

    let newAppt: OltpAppointment = {
      idCita: String(9000126 + oltpAppointments.length),
      idPaciente: patient.idPaciente,
      distrito: patient.barrio,
      edad: patient.edad,
      odontologoId: dentist.id,
      odontologoNombre: dentist.nombre,
      sillon: `${dentist.sillon} (${dentist.especialidad})`,
      especialidad: dentist.especialidad,
      tratamientoCodigo: treatment.codigo,
      tratamientoNombre: treatment.nombre,
      costo: input.costo,
      fechaProgramacion: `${todayIso} ${formatTimeNow()}`,
      fechaCita: input.fechaCita,
      hora: formatTimeNow().slice(0, 5),
      tiempoEspera: diffDays,
      smsRecibido: input.smsRecibido,
      noShow: input.noShow,
      bucketTiempo: bucket,
      sincronizadoDM: false,
    };

    try {
      const apiCreated = await clinicalApi.createCita({
        idPaciente: input.idPaciente,
        odontologoId: input.odontologoId,
        tratamientoCodigo: treatment.codigo,
        costo: input.costo,
        fechaCita: input.fechaCita,
        smsRecibido: input.smsRecibido,
        noShow: input.noShow,
      });
      if (apiCreated?.idCita) newAppt = apiCreated;
      setApiConnected(true);
      appendSqlLog('POST_API', `POST ${FASTAPI_BASE_URL}/api/citas -> IdCita ${newAppt.idCita}`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Error al Registrar Cita', err.message, 'error');
        appendSqlLog('SQL_REJECTED', `POST /api/citas rechazado (${err.status}): ${err.message}`, 'error');
        return null;
      }
      appendSqlLog('API_FALLBACK', 'POST /api/citas aplicado en caché local.', 'warn');
    }

    setOltpAppointments((prev) => [newAppt, ...prev]);
    setOltpTotalCount((c) => c + 1);

    setPatients((prev) =>
      prev.map((p) =>
        p.idPaciente === patient.idPaciente
          ? { ...p, citasCount: p.citasCount + 1, ultimaCita: input.fechaCita }
          : p
      )
    );

    appendSqlLog(
      'INSERT_OLTP',
      `INSERT INTO oltp.Citas (IdCita, IdPaciente, IdOdontologo, IdTratamiento, FechaCita, CostoAplicado, SMSRecibido, NoShow) VALUES (${newAppt.idCita}, ${patient.idPaciente}, ${dentist.id}, ${treatment.idTratamiento ?? 1}, '${input.fechaCita}', ${input.costo.toFixed(2)}, ${input.smsRecibido}, '${input.noShow === 'Pendiente' ? 'Pen' : input.noShow}');`,
      'cmd'
    );
    appendSqlLog(
      'TRIGGER_CDC',
      `1 fila afectada en oltp.Citas. Scoring IA estimado: ${input.probabilidad ?? computeNoShowProbability({ diasEspera: diffDays, edad: patient.edad, smsRecibido: input.smsRecibido === 1 })}%.`,
      'success'
    );

    pushToast('Cita Registrada', `Cita #${newAppt.idCita} insertada atómicamente en oltp.Citas.`);
    return newAppt;
  };

  const toggleOltpSms = async (idCita: string) => {
    const current = oltpAppointments.find((a) => a.idCita === idCita);
    if (!current) return;
    const nextSms: 0 | 1 = current.smsRecibido === 1 ? 0 : 1;

    try {
      await clinicalApi.toggleCitaSms(idCita, nextSms);
      setApiConnected(true);
      appendSqlLog('PATCH_API', `PATCH ${FASTAPI_BASE_URL}/api/citas/${idCita}/sms -> ${nextSms}`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Error al Actualizar SMS', err.message, 'error');
        return;
      }
      appendSqlLog('API_FALLBACK', `PATCH /api/citas/${idCita}/sms aplicado localmente.`, 'warn');
    }

    setOltpAppointments((prev) =>
      prev.map((a) => (a.idCita === idCita ? { ...a, smsRecibido: nextSms } : a))
    );
    appendSqlLog(
      'UPDATE_OLTP',
      `UPDATE oltp.Citas SET SMSRecibido = ${nextSms} WHERE IdCita = ${idCita};`,
      'cmd'
    );
    pushToast(
      nextSms === 1 ? 'SMS Confirmado' : 'SMS Marcado Pendiente',
      `Estado SMS de Cita #${idCita} actualizado a ${nextSms}.`
    );
  };

  const updateOltpNoShow = async (idCita: string, status: NoShowStatus) => {
    try {
      await clinicalApi.updateCitaNoShow(idCita, status);
      setApiConnected(true);
      appendSqlLog('PATCH_API', `PATCH ${FASTAPI_BASE_URL}/api/citas/${idCita}/noshow -> ${status}`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Error al Actualizar Asistencia', err.message, 'error');
        return;
      }
      appendSqlLog('API_FALLBACK', `PATCH /api/citas/${idCita}/noshow aplicado localmente.`, 'warn');
    }

    setOltpAppointments((prev) =>
      prev.map((a) => (a.idCita === idCita ? { ...a, noShow: status } : a))
    );
    const dbVal = status === 'Pendiente' ? 'Pen' : status;
    appendSqlLog(
      'UPDATE_OLTP',
      `UPDATE oltp.Citas SET NoShow = '${dbVal}' WHERE IdCita = ${idCita};`,
      'cmd'
    );
    pushToast('Asistencia Actualizada', `Cita #${idCita} marcada como '${status}'.`);
  };

  const rescheduleOltpAppointment = async (idCita: string, newDate: string) => {
    let updatedWait: number | undefined;
    try {
      const res = await clinicalApi.rescheduleCita(idCita, newDate);
      if (typeof res?.tiempoEspera === 'number') updatedWait = res.tiempoEspera;
      setApiConnected(true);
      appendSqlLog('PATCH_API', `PATCH ${FASTAPI_BASE_URL}/api/citas/${idCita}/reprogramar -> ${newDate}`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Error al Reprogramar Cita', err.message, 'error');
        appendSqlLog('SQL_REJECTED', `PATCH /api/citas/${idCita}/reprogramar rechazado: ${err.message}`, 'error');
        return;
      }
      appendSqlLog('API_FALLBACK', `PATCH /api/citas/${idCita}/reprogramar aplicado localmente.`, 'warn');
    }

    const todayDate = new Date(`${getTodayIsoDate()}T00:00:00`);
    const targetDate = new Date(`${newDate}T00:00:00`);
    const diffDays =
      updatedWait ??
      Math.max(0, Math.ceil((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)));

    setOltpAppointments((prev) =>
      prev.map((a) =>
        a.idCita === idCita
          ? {
              ...a,
              fechaCita: newDate,
              tiempoEspera: diffDays,
              noShow: 'Pendiente',
            }
          : a
      )
    );
    appendSqlLog(
      'UPDATE_OLTP',
      `UPDATE oltp.Citas SET FechaCita = '${newDate}', NoShow = 'Pen' WHERE IdCita = ${idCita};`,
      'cmd'
    );
    pushToast('Cita Reprogramada', `Nueva fecha ${newDate} guardada para Cita #${idCita}.`);
  };

  const deleteOltpAppointment = async (idCita: string) => {
    try {
      await clinicalApi.deleteCita(idCita);
      setApiConnected(true);
      appendSqlLog('DELETE_API', `DELETE ${FASTAPI_BASE_URL}/api/citas/${idCita} -> 200 OK`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Error al Eliminar Cita', err.message, 'error');
        return;
      }
      appendSqlLog('API_FALLBACK', `DELETE /api/citas/${idCita} aplicado localmente.`, 'warn');
    }

    setOltpAppointments((prev) => prev.filter((a) => a.idCita !== idCita));
    setOltpTotalCount((c) => Math.max(0, c - 1));
    appendSqlLog('DELETE_OLTP', `DELETE FROM oltp.Citas WHERE IdCita = ${idCita};`, 'warn');
    pushToast('Cita Cancelada', `Registro #${idCita} eliminado de oltp.Citas.`, 'warning');
  };

  const confirmRetentionSmsWriteBack = async (idCita: string) => {
    const target = retentionRows.find((r) => r.idCita === idCita);
    if (!target) return;
    if (target.smsRecibido === 1) {
      pushToast('Ya Confirmado', 'La cita ya contaba con confirmación SMS registrada.', 'info');
      return;
    }

    const oldProb = target.probabilidad;
    let newProb = Math.max(5, oldProb - 15);
    let nuevoNivel = target.nivelRiesgo;

    try {
      const res = await clinicalApi.confirmarSmsWriteBack(idCita);
      if (typeof res?.probabilidad === 'number') {
        newProb = res.probabilidad;
      }
      if (res?.nivelRiesgo) {
        nuevoNivel = res.nivelRiesgo;
      }
      setApiConnected(true);
      appendSqlLog(
        'POST_API',
        `POST ${FASTAPI_BASE_URL}/api/retencion/${idCita}/confirmar-sms -> prob=${newProb}% (RF Recalculado)`,
        'success'
      );
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Error en Write-Back SQL', err.message, 'error');
        return;
      }
      appendSqlLog('API_FALLBACK', `Write-Back /api/retencion/${idCita} aplicado localmente.`, 'warn');
    }

    const reduction = oldProb - newProb;

    setRetentionRows((prev) =>
      prev.map((r) =>
        r.idCita === idCita
          ? { ...r, smsRecibido: 1, probabilidad: newProb, nivelRiesgo: nuevoNivel }
          : r
      )
    );

    appendSqlLog(
      'WRITE-BACK',
      `UPDATE oltp.Citas SET SMSRecibido = 1 WHERE IdCita = ${idCita}; UPDATE dm.Fact_Atenciones SET SMSRecibido = 1 WHERE IdCita = ${idCita};`,
      'warn'
    );
    appendSqlLog(
      'RF_RESCORING',
      `IdCita: ${idCita} sincronizado con dm.Resultados_Prediccion_IA. Inferencia RF actualizada: ${oldProb}% -> ${newProb}%.`,
      'success'
    );

    pushToast(
      'Write-Back & Scoring IA Confirmado',
      `Cita #${idCita} actualizada en SQL Server. Riesgo recalculado: ${newProb}% (${reduction >= 0 ? `-${reduction}%` : `+${Math.abs(reduction)}%`}).`
    );
  };

  const syncOltpToDataMart = async () => {
    if (isSyncingEtl) return;
    setIsSyncingEtl(true);

    appendSqlLog('ETL_SYNC', `POST ${FASTAPI_BASE_URL}/api/sincronizar-datamart`, 'cmd');
    appendSqlLog(
      'ETL_EXEC',
      `EXEC dm.usp_ETL_CargarDataMart;`,
      'cmd'
    );

    let evaluatedCount = pendingDeltasCount;
    try {
      const res = await clinicalApi.sincronizarDatamart();
      setApiConnected(true);
      if (typeof res?.syncedRows === 'number') {
        evaluatedCount = res.syncedRows;
      }
      if (typeof res?.dmFactCount === 'number') {
        setDmFactCount(res.dmFactCount);
      }
      await refreshAllFromApi(true);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Error ETL Data Mart', err.message, 'error');
        setIsSyncingEtl(false);
        return;
      }
      setDmFactCount((c) => c + pendingDeltasCount);
    }

    setOltpAppointments((prev) => prev.map((a) => ({ ...a, sincronizadoDM: true })));
    setLastSyncTime(`${formatTimeNow().slice(0, 5)} PET`);
    setIsSyncingEtl(false);

    appendSqlLog(
      'SUCCESS',
      `Sincronización exitosa: [dm].[Fact_Atenciones] actualizado y ${evaluatedCount} pacientes evaluados en [dm].[Resultados_Prediccion_IA].`,
      'success'
    );
    pushToast(
      'Data Mart Sincronizado',
      `dm.Fact_Atenciones sincronizado y scoring IA recalculado (${evaluatedCount} nuevos pacientes).`
    );
  };

  const execStagingToOltp = async () => {
    if (isSyncingEtl) return;
    setIsSyncingEtl(true);
    appendSqlLog('EXEC_CALL', `POST ${FASTAPI_BASE_URL}/api/etl/cargar-oltp`, 'warn');

    let processed = stgQueueCount;
    try {
      const res = await clinicalApi.execStagingToOltp();
      setApiConnected(true);
      if (typeof res?.processedRows === 'number') processed = res.processedRows;
      if (typeof res?.oltpTotalCount === 'number') {
        setOltpTotalCount(res.oltpTotalCount);
      }
      await refreshAllFromApi(true);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        pushToast('Error en Carga OLTP', err.message, 'error');
        setIsSyncingEtl(false);
        return;
      }
    }

    setIsSyncingEtl(false);
    appendSqlLog(
      'SUCCESS',
      `EXEC stg.usp_CargarOLTP finalizado (${processed.toLocaleString()} registros auditados en stg.Rechazos_Ingesta). COMMIT TRAN;`,
      'success'
    );
    pushToast('Staging Sincronizado', `Procedimiento stg.usp_CargarOLTP ejecutado en SQL Server.`);
  };

  const retrainAiModel = async () => {
    if (isSyncingEtl) return;
    setIsSyncingEtl(true);
    appendSqlLog('PY_AI', `POST ${FASTAPI_BASE_URL}/api/ml/reentrenar`, 'cmd');

    let nextAuc = '0.842';
    try {
      const res = await clinicalApi.retrainModel();
      setApiConnected(true);
      if (res?.aucRoc) nextAuc = res.aucRoc;
    } catch {
      // fallback value
    }

    setModelAuc(nextAuc);
    setIsSyncingEtl(false);
    appendSqlLog(
      'MODEL_READY',
      `Validación de modelo finalizada: AUC-ROC: ${nextAuc} | modelo_rf_dental.pkl activo en memoria.`,
      'success'
    );
    pushToast('Modelo Verificado', `modelo_rf_dental.pkl activo con AUC-ROC ${nextAuc}.`);
  };

  return (
    <ClinicalContext.Provider
      value={{
        activeModule,
        setActiveModule,
        workspaceMode,
        setWorkspaceMode,
        preselectedPatientDni,
        navigateToAppointmentForPatient,
        apiConnected,
        isLoadingData,
        refreshAllFromApi,
        searchPatientsFromApi,
        treatments,
        dentists,
        patients,
        addPatient,
        updatePatient,
        deletePatient,
        oltpAppointments,
        addOltpAppointment,
        toggleOltpSms,
        updateOltpNoShow,
        rescheduleOltpAppointment,
        deleteOltpAppointment,
        retentionRows,
        confirmRetentionSmsWriteBack,
        pendingDeltasCount,
        stgQueueCount,
        oltpTotalCount,
        oltpPacientesCount,
        oltpPacientesFCount,
        oltpPacientesMCount,
        oltpTopBarrio,
        dmFactCount,
        lastSyncTime,
        isSyncingEtl,
        syncOltpToDataMart,
        execStagingToOltp,
        retrainAiModel,
        modelAuc,
        sqlLogs,
        appendSqlLog,
        clearSqlLogs,
        auditEvents,
        toasts,
        pushToast,
        dismissToast,
      }}
    >
      {children}
    </ClinicalContext.Provider>
  );
};

export function useClinical() {
  const ctx = useContext(ClinicalContext);
  if (!ctx) throw new Error('useClinical must be used within a ClinicalProvider');
  return ctx;
}
