import {
  DataMartRetentionRow,
  NoShowStatus,
  OltpAppointment,
  Patient,
} from '../types/clinical';

export const FASTAPI_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface KpisMonitorResponse {
  tasaInasistencia?: number;
  citasProgramadas?: number;
  ingresosEnRiesgo?: number;
  tiempoMedioEspera?: number;
  turnosSalvados?: number;
  ingresosRecuperados?: number;
  eficienciaSillon?: number;
  asistenciaConSms?: number;
  asistenciaSinSms?: number;
  ultimoSync?: string;
  kpis?: {
    TotalCitas: number;
    TotalAusencias: number;
    TasaInasistencia: number;
    EsperaPromedio: number;
    IngresosEnRiesgo: number;
  };
  monitor?: {
    stg_rechazos: number;
    oltp_pacientes: number;
    oltp_pacientes_f?: number;
    oltp_pacientes_m?: number;
    oltp_top_barrio?: string;
    oltp_citas: number;
    dm_hechos: number;
    dm_predicciones: number;
  };
}

export interface PredictNoShowPayload {
  edad: number;
  genero: 'F' | 'M';
  tratamientoCodigo: string;
  diasEspera: number;
  distrito: string;
  smsRecibido: boolean;
}

export interface PredictNoShowResponse {
  probabilidad: number;
  nivelRiesgo?: string;
  desglose?: {
    tiempoEsperaPts: number;
    edadPts: number;
    smsPts: number;
  };
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${FASTAPI_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody?.detail) detail = String(errBody.detail);
      } catch {
        // ignore JSON parse errors on error response
      }
      throw new Error(detail);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const clinicalApi = {
  // KPIs & Power BI Monitor
  getKpisMonitor: (period: string, sede: string) =>
    requestJson<KpisMonitorResponse>(
      `/api/kpis-monitor?period=${encodeURIComponent(period)}&sede=${encodeURIComponent(sede)}`
    ),

  // Pacientes (oltp.Pacientes)
  getPacientes: () => requestJson<Patient[]>('/api/pacientes'),

  createPaciente: (
    payload: Omit<Patient, 'citasCount' | 'ultimaCita' | 'estadoClinico' | 'etapaBadge'>
  ) =>
    requestJson<Patient>('/api/pacientes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePaciente: (idPaciente: string, payload: Patient) =>
    requestJson<Patient>(`/api/pacientes/${encodeURIComponent(idPaciente)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deletePaciente: (idPaciente: string) =>
    requestJson<void>(`/api/pacientes/${encodeURIComponent(idPaciente)}`, {
      method: 'DELETE',
    }),

  // Citas OLTP (oltp.Citas)
  getCitas: () => requestJson<OltpAppointment[]>('/api/citas'),

  createCita: (payload: {
    idPaciente: string;
    odontologoId: number;
    tratamientoCodigo: string;
    costo: number;
    fechaCita: string;
    smsRecibido: 0 | 1;
    noShow: NoShowStatus;
  }) =>
    requestJson<OltpAppointment>('/api/citas', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleCitaSms: (idCita: string, smsRecibido: 0 | 1) =>
    requestJson<OltpAppointment>(`/api/citas/${encodeURIComponent(idCita)}/sms`, {
      method: 'PATCH',
      body: JSON.stringify({ smsRecibido }),
    }),

  updateCitaNoShow: (idCita: string, noShow: NoShowStatus) =>
    requestJson<OltpAppointment>(`/api/citas/${encodeURIComponent(idCita)}/noshow`, {
      method: 'PATCH',
      body: JSON.stringify({ noShow }),
    }),

  rescheduleCita: (idCita: string, fechaCita: string) =>
    requestJson<OltpAppointment>(
      `/api/citas/${encodeURIComponent(idCita)}/reprogramar`,
      {
        method: 'PATCH',
        body: JSON.stringify({ fechaCita }),
      }
    ),

  deleteCita: (idCita: string) =>
    requestJson<void>(`/api/citas/${encodeURIComponent(idCita)}`, {
      method: 'DELETE',
    }),

  // Matriz de Retención IA (dm.Fact_Atenciones + Scoring)
  getRetencion: () => requestJson<DataMartRetentionRow[]>('/api/retencion'),

  confirmarSmsWriteBack: (idCita: string) =>
    requestJson<{ idCita: string; smsRecibido: 1; probabilidad: number }>(
      `/api/retencion/${encodeURIComponent(idCita)}/confirmar-sms`,
      {
        method: 'POST',
      }
    ),

  // Simulador Prescriptivo en vivo & Pipeline ETL
  predictEnVivo: (payload: PredictNoShowPayload) =>
    requestJson<PredictNoShowResponse>('/api/predecir-en-vivo', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  sincronizarDatamart: () =>
    requestJson<{ syncedRows: number; dmFactCount?: number }>(
      '/api/sincronizar-datamart',
      { method: 'POST' }
    ),

  execStagingToOltp: () =>
    requestJson<{ processedRows: number; oltpTotalCount?: number }>(
      '/api/etl/cargar-oltp',
      { method: 'POST' }
    ),

  retrainModel: () =>
    requestJson<{ aucRoc: string; f1Score?: string }>('/api/ml/reentrenar', {
      method: 'POST',
    }),
};
