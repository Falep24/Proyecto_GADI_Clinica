import {
  DataMartRetentionRow,
  Dentist,
  NoShowStatus,
  OltpAppointment,
  Patient,
  Treatment,
} from '../types/clinical';

export const FASTAPI_BASE_URL = 
  import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

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
  fechaCita?: string;
  idPaciente?: string;
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
  const timeoutId = setTimeout(() => controller.abort(), 60000);

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
        if (errBody?.detail) {
          detail =
            typeof errBody.detail === 'string'
              ? errBody.detail
              : JSON.stringify(errBody.detail);
        }
      } catch {
        // ignore JSON parse errors on error response
      }
      throw new ApiError(response.status, detail);
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
  // Catálogos oficiales desde SQL Server
  getTratamientos: () => requestJson<Treatment[]>('/api/tratamientos'),
  getOdontologos: () => requestJson<Dentist[]>('/api/odontologos'),

  // KPIs & Power BI Monitor
  getKpisMonitor: (period: string, sede: string) =>
    requestJson<KpisMonitorResponse>(
      `/api/kpis-monitor?period=${encodeURIComponent(period)}&sede=${encodeURIComponent(sede)}`
    ),

  // Pacientes (oltp.Pacientes) con búsqueda y límite en servidor
  getPacientes: (buscar = '', limit = 100) => {
    const params = new URLSearchParams();
    params.set('limit', String(Math.min(500, Math.max(1, limit))));
    if (buscar.trim()) {
      params.set('buscar', buscar.trim());
    }
    return requestJson<Patient[]>(`/api/pacientes?${params.toString()}`);
  },

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
  getCitas: (limit = 100) =>
    requestJson<OltpAppointment[]>(`/api/citas?limit=${Math.min(500, Math.max(1, limit))}`),

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
  getRetencion: (riesgo = 'Todos', limit = 100) =>
    requestJson<DataMartRetentionRow[]>(
      `/api/retencion?riesgo=${encodeURIComponent(riesgo)}&limit=${Math.min(500, Math.max(1, limit))}`
    ),

  confirmarSmsWriteBack: (idCita: string) =>
    requestJson<{ idCita: string; smsRecibido: 1; probabilidad: number; nivelRiesgo?: string }>(
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
