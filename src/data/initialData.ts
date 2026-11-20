import {
  AuditEvent,
  DataMartRetentionRow,
  Dentist,
  OltpAppointment,
  Patient,
  Treatment,
} from '../types/clinical';

export const LOGO_URL =
  'https://lh3.googleusercontent.com/aida/ALJJyrCJh130EnZCQZW-hUQCxtvkuIyb6HiSx5DfHfGZCI_sR10d4IWCzYVNglBCYnlpUyEGtmvEJG4Bq8jtnDyrDp0jys2GFoYOp32S3JM2lCpIu0Y5D_BzIt8QPtVIjN4VCiccxnGrT7NZPrc9GDduhk5vZRjym4PDIQdhqz0r9Antpb8pjVdVLjoNi1ZXMj0PD6_VUMR_EdPVLMrgt04g_LHKUCckcJbu926llYhkLLw';

export const LIMA_DISTRICTS = [
  'Santiago de Surco',
  'Miraflores',
  'San Isidro',
  'San Borja',
  'La Molina',
  'San Juan de Lurigancho',
  'Los Olivos',
  'Ate',
  'San Martín de Porres',
  'Magdalena del Mar',
  'Jesús María',
  'Pueblo Libre',
  'Chorrillos',
  'San Miguel',
  'Surquillo',
];

export const DENTISTS: Dentist[] = [
  { id: 1, nombre: 'Dr. Carlos Mendoza', especialidad: 'Odontología General', sillon: 'Sillón 1' },
  { id: 2, nombre: 'Dra. Lucía Paredes', especialidad: 'Endodoncia', sillon: 'Sillón 2' },
  { id: 3, nombre: 'Dr. Jorge Salas', especialidad: 'Ortodoncia', sillon: 'Sillón 3' },
];

// Catálogo oficial alineado con oltp.Tratamientos en DentalCenterDB
export const TREATMENTS: Treatment[] = [
  { idTratamiento: 1, codigo: 'CPMS-01', nombre: 'Consulta Odontológica General', costo: 30.0, especialidad: 'Odontología General', severidad: 'low' },
  { idTratamiento: 2, codigo: 'CPMS-02', nombre: 'Profilaxis y Destartraje', costo: 50.0, especialidad: 'Periodoncia', severidad: 'low' },
  { idTratamiento: 3, codigo: 'CPMS-03', nombre: 'Curación con Resina Fotocurable', costo: 70.0, especialidad: 'Odontología General', severidad: 'medium' },
  { idTratamiento: 4, codigo: 'CPMS-04', nombre: 'Exodoncia Simple', costo: 60.0, especialidad: 'Odontología General', severidad: 'medium' },
  { idTratamiento: 5, codigo: 'CPMS-05', nombre: 'Endodoncia Unirradicular', costo: 150.0, especialidad: 'Endodoncia', severidad: 'high' },
  { idTratamiento: 6, codigo: 'CPMS-06', nombre: 'Ortodoncia - Control Mensual', costo: 80.0, especialidad: 'Ortodoncia', severidad: 'medium' },
];

export const INITIAL_PATIENTS: Patient[] = [
  {
    idPaciente: '45892110',
    genero: 'F',
    edad: 42,
    barrio: 'San Juan de Lurigancho',
    citasCount: 6,
    ultimaCita: '2026-10-14',
    estadoClinico: 'Ortodoncia - Control Mensual',
    etapaBadge: 'active',
  },
  {
    idPaciente: '10984321',
    genero: 'M',
    edad: 36,
    barrio: 'Ate',
    citasCount: 3,
    ultimaCita: '2026-11-02',
    estadoClinico: 'Consulta Odontológica General',
    etapaBadge: 'neutral',
  },
];

export const INITIAL_OLTP_APPOINTMENTS: OltpAppointment[] = [
  {
    idCita: '9000125',
    idPaciente: '10003316',
    distrito: 'San Miguel',
    edad: 17,
    odontologoId: 1,
    odontologoNombre: 'Dr. Carlos Mendoza',
    sillon: 'Sillón 1 (Odontología General)',
    especialidad: 'Odontología General',
    tratamientoCodigo: 'CPMS-03',
    tratamientoNombre: 'Curación con Resina Fotocurable',
    costo: 70.0,
    fechaProgramacion: '2026-02-02 11:52:09',
    fechaCita: '2026-02-16',
    hora: '11:52',
    tiempoEspera: 14,
    smsRecibido: 1,
    noShow: 'No',
    bucketTiempo: 'hoy',
    sincronizadoDM: true,
  },
];

export const INITIAL_RETENTION_ROWS: DataMartRetentionRow[] = [
  {
    idCita: '5037291',
    skPaciente: 'SK-PAC-12500',
    dni: '10013095',
    edad: 20,
    genero: 'M',
    distrito: 'Magdalena del Mar',
    medico: 'Dr. Carlos Mendoza',
    especialidad: 'Odontología General',
    cpms: 'CPMS-01',
    tratamiento: 'Consulta Odontológica General',
    costo: 30.0,
    tiempoEspera: 45,
    smsRecibido: 0,
    probabilidad: 86,
    nivelRiesgo: 'Riesgo Alto',
    hora: '09:30',
  },
];

export const INITIAL_AUDIT_EVENTS: AuditEvent[] = [
  {
    id: 'aud-1',
    time: '10:41:02 PET',
    op: 'INSERT',
    proc: 'oltp.Pacientes',
    detail: 'Id: 44890123 — San Isidro (OK)',
    status: 'ok',
  },
  {
    id: 'aud-2',
    time: '10:39:15 PET',
    op: 'UPDATE',
    proc: 'oltp.Pacientes',
    detail: 'Id: 09823412 — Santiago de Surco',
    status: 'ok',
  },
  {
    id: 'aud-3',
    time: '10:35:48 PET',
    op: 'VERIFY CHECK',
    proc: 'CK_Pacientes_Edad',
    detail: 'Passed: (Edad >= 0 AND Edad <= 100)',
    status: 'ok',
  },
];
