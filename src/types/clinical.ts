export type ModuleId =
  | 'inteligencia-de-negocios'
  | 'agenda-inteligente-y-retencion'
  | 'simulador-prescriptivo-y-pipeline-etl'
  | 'gestion-de-pacientes'
  | 'agendamiento-y-control-de-citas';

export type WorkspaceMode = 'direccion' | 'recepcion';

export type GenderCode = 'F' | 'M';

export type NoShowStatus = 'Pendiente' | 'No' | 'Yes';

export interface Patient {
  idPaciente: string; // BIGINT PK en oltp.Pacientes
  genero: GenderCode;
  edad: number;
  barrio: string;
  citasCount: number;
  ultimaCita: string;
  estadoClinico: string;
  etapaBadge?: 'active' | 'neutral';
}

export interface Dentist {
  id: number;
  nombre: string;
  especialidad: string;
  sillon: string;
}

export interface Treatment {
  idTratamiento?: number;
  codigo: string;
  nombre: string;
  costo: number;
  especialidad: string;
  severidad: 'high' | 'medium' | 'low';
}

export interface OltpAppointment {
  idCita: string;
  idPaciente: string;
  distrito: string;
  edad: number;
  odontologoId: number;
  odontologoNombre: string;
  sillon: string;
  especialidad: string;
  tratamientoCodigo: string;
  tratamientoNombre: string;
  costo: number;
  fechaProgramacion: string;
  fechaCita: string;
  hora: string;
  tiempoEspera: number;
  smsRecibido: 0 | 1;
  noShow: NoShowStatus;
  bucketTiempo: 'hoy' | 'manana' | 'semana';
  sincronizadoDM: boolean;
}

export interface DataMartRetentionRow {
  idCita: string;
  skPaciente: string;
  dni: string;
  edad: number;
  genero: GenderCode;
  distrito: string;
  medico: string;
  especialidad: string;
  cpms: string;
  tratamiento: string;
  costo: number;
  tiempoEspera: number;
  smsRecibido: 0 | 1;
  probabilidad: number;
  nivelRiesgo?: string;
  hora: string;
}

export interface SqlLogEntry {
  id: string;
  timestamp: string;
  prefix: string;
  message: string;
  tone: 'info' | 'cmd' | 'success' | 'warn' | 'error';
}

export interface AuditEvent {
  id: string;
  time: string;
  op: 'INSERT' | 'UPDATE' | 'VERIFY CHECK' | 'DELETE';
  proc: string;
  detail: string;
  status: 'ok' | 'warn';
}

export interface ToastNotice {
  id: string;
  title: string;
  message: string;
  variant: 'success' | 'info' | 'warning' | 'error';
}
