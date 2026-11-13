import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DENTISTS,
  INITIAL_AUDIT_EVENTS,
  INITIAL_OLTP_APPOINTMENTS,
  INITIAL_PATIENTS,
  INITIAL_RETENTION_ROWS,
  TREATMENTS,
} from '../data/initialData';
import { clinicalApi, FASTAPI_BASE_URL } from '../services/api';
import {
  AuditEvent,
  DataMartRetentionRow,
  ModuleId,
  NoShowStatus,
  OltpAppointment,
  Patient,
  SqlLogEntry,
  ToastNotice,
  WorkspaceMode,
} from '../types/clinical';

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

  patients: Patient[];
  addPatient: (
    patient: Omit<Patient, 'citasCount' | 'ultimaCita' | 'estadoClinico' | 'etapaBadge'>
  ) => Promise<boolean>;
  updatePatient: (patient: Patient) => Promise<void>;
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

  const [patients, setPatients] = useState<Patient[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.patients)) return parsed.patients;
      }
    } catch {
      // ignore storage read error
    }
    return INITIAL_PATIENTS;
  });

  const [oltpAppointments, setOltpAppointments] = useState<OltpAppointment[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.oltpAppointments)) return parsed.oltpAppointments;
      }
    } catch {
      // ignore
    }
    return INITIAL_OLTP_APPOINTMENTS;
  });

  const [retentionRows, setRetentionRows] = useState<DataMartRetentionRow[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.retentionRows)) return parsed.retentionRows;
      }
    } catch {
      // ignore
    }
    return INITIAL_RETENTION_ROWS;
  });

  const [stgQueueCount, setStgQueueCount] = useState<number>(2450);
  const [oltpTotalCount, setOltpTotalCount] = useState<number>(84120);
  const [dmFactCount, setDmFactCount] = useState<number>(126890);
  const [lastSyncTime, setLastSyncTime] = useState<string>('10:42 PET');
  const [isSyncingEtl, setIsSyncingEtl] = useState<boolean>(false);
  const [modelAuc, setModelAuc] = useState<string>('0.842');

  const [sqlLogs, setSqlLogs] = useState<SqlLogEntry[]>([
    {
      id: 'log-1',
      timestamp: '2026-11-12 10:35:12.104',
      prefix: 'SESSION: SPID-64',
      message: "Connected to instance 'LIM-SRV-DATA01\\MSSQLSERVER'. Database context set to [DentalCenterDB].",
      tone: 'info',
    },
    {
      id: 'log-2',
      timestamp: '2026-11-12 10:38:00.240',
      prefix: 'FASTAPI',
      message: `Inicializando cliente REST hacia FastAPI (${FASTAPI_BASE_URL}/api/*)...`,
      tone: 'cmd',
    },
  ]);

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(INITIAL_AUDIT_EVENTS);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ patients, oltpAppointments, retentionRows })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [patients, oltpAppointments, retentionRows]);

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
      const [apiPatients, apiCitas, apiRetencion] = await Promise.all([
        clinicalApi.getPacientes(),
        clinicalApi.getCitas(),
        clinicalApi.getRetencion(),
      ]);

      if (Array.isArray(apiPatients) && apiPatients.length > 0) setPatients(apiPatients);
      if (Array.isArray(apiCitas) && apiCitas.length > 0) setOltpAppointments(apiCitas);
      if (Array.isArray(apiRetencion) && apiRetencion.length > 0) setRetentionRows(apiRetencion);

      setApiConnected(true);
      appendSqlLog(
        'FASTAPI_OK',
        `GET ${FASTAPI_BASE_URL}/api/pacientes, /api/citas, /api/retencion sincronizados.`,
        'success'
      );
    } catch (err) {
      setApiConnected(false);
      const reason = err instanceof Error ? err.message : 'Error de red';
      appendSqlLog(
        'FASTAPI_OFFLINE',
        `No se pudo conectar con ${FASTAPI_BASE_URL} (${reason}). Operando con datos de prueba (fallback).`,
        'warn'
      );
    } finally {
      if (!silent) setIsLoadingData(false);
    }
  }, [appendSqlLog]);

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
    return 11 + unsynced;
  }, [oltpAppointments]);

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
    pushToast('Paciente seleccionado', `Cargando ficha de DNI ${dni} en Agendamiento & Citas IA`, 'info');
  };

  const addPatient = async (
    patientInput: Omit<Patient, 'citasCount' | 'ultimaCita' | 'estadoClinico' | 'etapaBadge'>
  ): Promise<boolean> => {
    if (patients.some((p) => p.idPaciente === patientInput.idPaciente)) {
      pushToast(
        'Error de Clave Primaria',
        `PK_Pacientes_IdPaciente duplicada: el DNI ${patientInput.idPaciente} ya existe en oltp.Pacientes.`,
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
      appendSqlLog('POST_API', `POST ${FASTAPI_BASE_URL}/api/pacientes -> 201 Created`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.startsWith('HTTP 4')) {
        pushToast('Validación FastAPI', msg, 'error');
        return false;
      }
      appendSqlLog('API_FALLBACK', `POST /api/pacientes en caché local (${msg || 'offline'}).`, 'warn');
    }

    setPatients((prev) => [createdPatient, ...prev]);
    appendSqlLog(
      'INSERT_PACIENTE',
      `INSERT INTO oltp.Pacientes (IdPaciente, Nombres, Genero, Edad, Barrio) VALUES ('${createdPatient.idPaciente}', N'${createdPatient.nombre}', '${createdPatient.genero}', ${createdPatient.edad}, N'${createdPatient.barrio}');`,
      'cmd'
    );
    pushAudit('INSERT', 'sp_RegistrarPaciente', `Id: ${createdPatient.idPaciente} — ${createdPatient.barrio} (OK)`);
    pushToast('Paciente Registrado', `${createdPatient.nombre} (${createdPatient.idPaciente}) guardado en oltp.Pacientes.`);
    return true;
  };

  const updatePatient = async (updated: Patient) => {
    let finalPatient = updated;
    try {
      const apiRes = await clinicalApi.updatePaciente(updated.idPaciente, updated);
      if (apiRes?.idPaciente) finalPatient = apiRes;
      setApiConnected(true);
      appendSqlLog('PUT_API', `PUT ${FASTAPI_BASE_URL}/api/pacientes/${updated.idPaciente} -> 200 OK`, 'success');
    } catch {
      appendSqlLog('API_FALLBACK', `PUT /api/pacientes/${updated.idPaciente} aplicado localmente.`, 'warn');
    }

    setPatients((prev) =>
      prev.map((p) => (p.idPaciente === finalPatient.idPaciente ? finalPatient : p))
    );
    appendSqlLog(
      'UPDATE_PACIENTE',
      `UPDATE oltp.Pacientes SET Nombres = N'${finalPatient.nombre}', Genero = '${finalPatient.genero}', Edad = ${finalPatient.edad}, Barrio = N'${finalPatient.barrio}' WHERE IdPaciente = '${finalPatient.idPaciente}';`,
      'cmd'
    );
    pushAudit('UPDATE', 'sp_ActualizarPaciente', `Id: ${finalPatient.idPaciente} — ${finalPatient.barrio}`);
    pushToast('Registro Actualizado', `Expediente ${finalPatient.idPaciente} actualizado en DentalCenterDB.`);
  };

  const deletePatient = async (idPaciente: string): Promise<{ ok: boolean; reason?: string }> => {
    const hasOltp = oltpAppointments.some((a) => a.idPaciente === idPaciente);
    const hasDm = retentionRows.some((r) => r.dni === idPaciente);
    if (hasOltp || hasDm) {
      appendSqlLog(
        'FK_CONFLICT',
        `DELETE statement conflicted with the REFERENCE constraint "FK_Citas_Pacientes" for IdPaciente = '${idPaciente}'.`,
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
      appendSqlLog('DELETE_API', `DELETE ${FASTAPI_BASE_URL}/api/pacientes/${idPaciente} -> 204`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.startsWith('HTTP 4')) {
        pushToast('Restricción Backend', msg, 'error');
        return { ok: false, reason: msg };
      }
      appendSqlLog('API_FALLBACK', `DELETE /api/pacientes/${idPaciente} aplicado localmente.`, 'warn');
    }

    setPatients((prev) => prev.filter((p) => p.idPaciente !== idPaciente));
    appendSqlLog(
      'DELETE_PACIENTE',
      `DELETE FROM oltp.Pacientes WHERE IdPaciente = '${idPaciente}'; -- 1 row affected`,
      'warn'
    );
    pushAudit('DELETE', 'sp_EliminarPaciente', `Id: ${idPaciente} — Eliminado`);
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
      idPaciente: input.idPaciente || '47812903',
      nombre: 'Paciente Registrado',
      genero: 'F' as const,
      edad: 30,
      barrio: 'Miraflores',
      telefono: '+51 987 000 111',
    };
    const dentist = DENTISTS.find((d) => d.id === input.odontologoId) || DENTISTS[0];
    const treatment =
      TREATMENTS.find((t) => t.codigo === input.tratamientoCodigo) || TREATMENTS[0];

    const today = new Date('2024-11-12T00:00:00');
    const targetDate = new Date(`${input.fechaCita}T00:00:00`);
    const diffDays = Math.max(
      0,
      Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    );

    const nextNumber = 1104 + oltpAppointments.length;
    const idCita = `CT-2024-${nextNumber}`;
    const bucket: OltpAppointment['bucketTiempo'] =
      diffDays === 0 ? 'hoy' : diffDays === 1 ? 'manana' : 'semana';

    let newAppt: OltpAppointment = {
      idCita,
      idPaciente: patient.idPaciente,
      pacienteNombre: patient.nombre,
      distrito: patient.barrio,
      edad: patient.edad,
      odontologoId: dentist.id,
      odontologoNombre: dentist.nombre,
      sillon: `${dentist.sillon} (${dentist.especialidad})`,
      especialidad: dentist.especialidad,
      tratamientoCodigo: treatment.codigo,
      tratamientoNombre: treatment.nombre,
      costo: input.costo,
      fechaProgramacion: '2024-11-12 10:42',
      fechaCita: input.fechaCita,
      hora: '10:30',
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
        tratamientoCodigo: input.tratamientoCodigo,
        costo: input.costo,
        fechaCita: input.fechaCita,
        smsRecibido: input.smsRecibido,
        noShow: input.noShow,
      });
      if (apiCreated?.idCita) newAppt = apiCreated;
      setApiConnected(true);
      appendSqlLog('POST_API', `POST ${FASTAPI_BASE_URL}/api/citas -> ${newAppt.idCita}`, 'success');
    } catch {
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
      `INSERT INTO oltp.Citas (IdCita, IdPaciente, IdOdontologo, IdTratamiento, FechaCita, CostoAplicado, SMSRecibido, NoShow) VALUES ('${newAppt.idCita}', '${patient.idPaciente}', ${dentist.id}, '${treatment.codigo}', '${input.fechaCita}', ${input.costo.toFixed(2)}, ${input.smsRecibido}, '${input.noShow}');`,
      'cmd'
    );
    appendSqlLog(
      'TRIGGER_CDC',
      `1 fila afectada en oltp.Citas. Scoring IA estimado: ${input.probabilidad ?? computeNoShowProbability({ diasEspera: diffDays, edad: patient.edad, smsRecibido: input.smsRecibido === 1 })}%.`,
      'success'
    );

    pushToast('Cita Registrada', `Cita ${newAppt.idCita} insertada atómicamente en oltp.Citas.`);
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
    } catch {
      appendSqlLog('API_FALLBACK', `PATCH /api/citas/${idCita}/sms aplicado localmente.`, 'warn');
    }

    setOltpAppointments((prev) =>
      prev.map((a) => (a.idCita === idCita ? { ...a, smsRecibido: nextSms, sincronizadoDM: false } : a))
    );
    appendSqlLog(
      'UPDATE_OLTP',
      `UPDATE oltp.Citas SET SMSRecibido = ${nextSms} WHERE IdCita = '${idCita}';`,
      'cmd'
    );
    pushToast(
      nextSms === 1 ? 'SMS Confirmado' : 'SMS Marcado Pendiente',
      `Estado SMS de ${idCita} actualizado a ${nextSms}.`
    );
  };

  const updateOltpNoShow = async (idCita: string, status: NoShowStatus) => {
    try {
      await clinicalApi.updateCitaNoShow(idCita, status);
      setApiConnected(true);
      appendSqlLog('PATCH_API', `PATCH ${FASTAPI_BASE_URL}/api/citas/${idCita}/noshow -> ${status}`, 'success');
    } catch {
      appendSqlLog('API_FALLBACK', `PATCH /api/citas/${idCita}/noshow aplicado localmente.`, 'warn');
    }

    setOltpAppointments((prev) =>
      prev.map((a) => (a.idCita === idCita ? { ...a, noShow: status, sincronizadoDM: false } : a))
    );
    appendSqlLog(
      'UPDATE_OLTP',
      `UPDATE oltp.Citas SET NoShow = '${status}' WHERE IdCita = '${idCita}';`,
      'cmd'
    );
    pushToast('Asistencia Actualizada', `Cita ${idCita} marcada como '${status}'.`);
  };

  const rescheduleOltpAppointment = async (idCita: string, newDate: string) => {
    try {
      await clinicalApi.rescheduleCita(idCita, newDate);
      setApiConnected(true);
      appendSqlLog('PATCH_API', `PATCH ${FASTAPI_BASE_URL}/api/citas/${idCita}/reprogramar -> ${newDate}`, 'success');
    } catch {
      appendSqlLog('API_FALLBACK', `PATCH /api/citas/${idCita}/reprogramar aplicado localmente.`, 'warn');
    }

    const today = new Date('2024-11-12T00:00:00');
    const targetDate = new Date(`${newDate}T00:00:00`);
    const diffDays = Math.max(
      0,
      Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    );

    setOltpAppointments((prev) =>
      prev.map((a) =>
        a.idCita === idCita
          ? {
              ...a,
              fechaCita: newDate,
              tiempoEspera: diffDays,
              noShow: 'Pendiente',
              sincronizadoDM: false,
            }
          : a
      )
    );
    appendSqlLog(
      'UPDATE_OLTP',
      `UPDATE oltp.Citas SET FechaCita = '${newDate} 10:00', NoShow = 'Pendiente' WHERE IdCita = '${idCita}';`,
      'cmd'
    );
    pushToast('Cita Reprogramada', `Nueva fecha ${newDate} guardada para ${idCita}.`);
  };

  const deleteOltpAppointment = async (idCita: string) => {
    try {
      await clinicalApi.deleteCita(idCita);
      setApiConnected(true);
      appendSqlLog('DELETE_API', `DELETE ${FASTAPI_BASE_URL}/api/citas/${idCita} -> 204`, 'success');
    } catch {
      appendSqlLog('API_FALLBACK', `DELETE /api/citas/${idCita} aplicado localmente.`, 'warn');
    }

    setOltpAppointments((prev) => prev.filter((a) => a.idCita !== idCita));
    appendSqlLog('DELETE_OLTP', `DELETE FROM oltp.Citas WHERE IdCita = '${idCita}';`, 'warn');
    pushToast('Cita Cancelada', `Registro ${idCita} eliminado de oltp.Citas.`, 'warning');
  };

  const confirmRetentionSmsWriteBack = async (idCita: string) => {
    const target = retentionRows.find((r) => r.idCita === idCita);
    if (!target) return;
    if (target.smsRecibido === 1) {
      pushToast('Ya Confirmado', 'La cita ya contaba con confirmación SMS registrada.', 'info');
      return;
    }

    const oldProb = target.probabilidad;
    let newProb = Math.max(5, oldProb - (Math.floor(Math.random() * 11) + 25));

    try {
      const res = await clinicalApi.confirmarSmsWriteBack(idCita);
      if (typeof res?.probabilidad === 'number') {
        newProb = res.probabilidad;
      }
      setApiConnected(true);
      appendSqlLog(
        'POST_API',
        `POST ${FASTAPI_BASE_URL}/api/retencion/${idCita}/confirmar-sms -> prob=${newProb}%`,
        'success'
      );
    } catch {
      appendSqlLog('API_FALLBACK', `Write-Back /api/retencion/${idCita} aplicado localmente (fallback).`, 'warn');
    }

    const reduction = Math.max(0, oldProb - newProb);

    setRetentionRows((prev) =>
      prev.map((r) =>
        r.idCita === idCita ? { ...r, smsRecibido: 1, probabilidad: newProb } : r
      )
    );

    appendSqlLog(
      'WRITE-BACK',
      `UPDATE oltp.Citas SET SMSRecibido = 1, ModificadoEl = GETDATE() WHERE IdCita = '${idCita}';`,
      'warn'
    );
    appendSqlLog(
      'CDC_REPLICATION',
      `IdCita: ${idCita} sincronizado con dm.Fact_Atenciones. Inferencia IA actualizada: ${oldProb}% -> ${newProb}% (-${reduction}%).`,
      'success'
    );

    pushToast(
      'Write-Back Confirmado',
      `Cita ${idCita} actualizada en SQL Server. Riesgo reducido en -${reduction}%.`
    );
  };

  const syncOltpToDataMart = async () => {
    if (isSyncingEtl) return;
    setIsSyncingEtl(true);

    const unsynced = oltpAppointments.filter((a) => !a.sincronizadoDM);
    appendSqlLog('ETL_SYNC', `POST ${FASTAPI_BASE_URL}/api/sincronizar-datamart`, 'cmd');
    appendSqlLog(
      'ETL_EXEC',
      `EXEC dm.usp_ETL_CargarDataMart @Modo = 'DELTA', @Lote = ${pendingDeltasCount};`,
      'cmd'
    );

    try {
      const res = await clinicalApi.sincronizarDatamart();
      setApiConnected(true);
      if (typeof res?.dmFactCount === 'number') {
        setDmFactCount(res.dmFactCount);
      } else {
        setDmFactCount((c) => c + pendingDeltasCount);
      }
      await refreshAllFromApi(true);
    } catch {
      setDmFactCount((c) => c + pendingDeltasCount);
      if (unsynced.length > 0) {
        setRetentionRows((prev) => {
          const existingIds = new Set(prev.map((r) => r.idCita));
          const additions: DataMartRetentionRow[] = unsynced
            .filter((a) => !existingIds.has(a.idCita))
            .map((a) => {
              const p = patients.find((pt) => pt.idPaciente === a.idPaciente);
              return {
                idCita: a.idCita,
                paciente: a.pacienteNombre,
                skPaciente: `SK-PAC-${a.idPaciente.slice(-4)}`,
                dni: a.idPaciente,
                edad: a.edad,
                genero: p?.genero ?? 'F',
                distrito: a.distrito,
                telefono: p?.telefono ?? '+51 987 654 321',
                medico: a.odontologoNombre,
                especialidad: a.especialidad,
                cpms: a.tratamientoCodigo,
                tratamiento: a.tratamientoNombre,
                costo: a.costo,
                tiempoEspera: a.tiempoEspera,
                smsRecibido: a.smsRecibido,
                probabilidad: computeNoShowProbability({
                  diasEspera: a.tiempoEspera,
                  edad: a.edad,
                  smsRecibido: a.smsRecibido === 1,
                }),
                hora: a.hora,
              };
            });
          return [...additions, ...prev];
        });
      }
    }

    setOltpAppointments((prev) => prev.map((a) => ({ ...a, sincronizadoDM: true })));
    setLastSyncTime(`${formatTimeNow().slice(0, 5)} PET`);
    setIsSyncingEtl(false);

    appendSqlLog(
      'SUCCESS',
      `MERGE exitoso: ${pendingDeltasCount} deltas cargados en [dm].[Fact_Atenciones] y scores guardados en [dm].[Resultados_Prediccion_IA].`,
      'success'
    );
    pushToast(
      'Data Mart Sincronizado',
      `${pendingDeltasCount} registros transferidos a dm.Fact_Atenciones y scoring IA recalculado.`
    );
  };

  const execStagingToOltp = async () => {
    if (isSyncingEtl) return;
    setIsSyncingEtl(true);
    appendSqlLog('EXEC_CALL', `POST ${FASTAPI_BASE_URL}/api/etl/cargar-oltp`, 'warn');

    let processed = stgQueueCount || 420;
    try {
      const res = await clinicalApi.execStagingToOltp();
      setApiConnected(true);
      if (typeof res?.processedRows === 'number') processed = res.processedRows;
      if (typeof res?.oltpTotalCount === 'number') {
        setOltpTotalCount(res.oltpTotalCount);
      } else {
        setOltpTotalCount((c) => c + processed);
      }
    } catch {
      setOltpTotalCount((c) => c + processed);
    }

    setStgQueueCount(0);
    setIsSyncingEtl(false);
    appendSqlLog(
      'SUCCESS',
      `EXEC stg.usp_CargarOLTP finalizado (0 errors, ${processed.toLocaleString()} affected rows). COMMIT TRAN;`,
      'success'
    );
    pushToast('Staging Sincronizado', `${processed.toLocaleString()} filas procesadas hacia oltp.Citas.`);
  };

  const retrainAiModel = async () => {
    if (isSyncingEtl) return;
    setIsSyncingEtl(true);
    appendSqlLog('PY_AI', `POST ${FASTAPI_BASE_URL}/api/ml/reentrenar`, 'cmd');

    let nextAuc = '0.846';
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
      `Reentrenamiento finalizado: Nuevo AUC-ROC: ${nextAuc} | Serialización RandomForest_v2.pkl OK.`,
      'success'
    );
    pushToast('Modelo Reentrenado', `RandomForest_v2.pkl actualizado con AUC-ROC ${nextAuc}.`);
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
