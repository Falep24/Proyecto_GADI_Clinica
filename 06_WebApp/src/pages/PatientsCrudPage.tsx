import React, { useEffect, useMemo, useState } from 'react';
import { useClinical } from '../context/ClinicalContext';
import { LIMA_DISTRICTS } from '../data/initialData';
import { GenderCode, Patient } from '../types/clinical';

type GenderFilter = 'all' | 'F' | 'M';
type AgeFilter = 'all' | 'pediatric' | 'adult' | 'senior';

export const PatientsCrudPage: React.FC = () => {
  const {
    patients,
    oltpPacientesCount,
    oltpPacientesFCount,
    oltpPacientesMCount,
    oltpTopBarrio,
    searchPatientsFromApi,
    addPatient,
    updatePatient,
    deletePatient,
    navigateToAppointmentForPatient,
    auditEvents,
    pushToast,
  } = useClinical();

  const [formOpen, setFormOpen] = useState(true);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);

  // Campos reales de oltp.Pacientes (IdPaciente, Genero, Edad, Barrio)
  const [idPaciente, setIdPaciente] = useState('');
  const [genero, setGenero] = useState<GenderCode>('F');
  const [edad, setEdad] = useState<string>('32');
  const [barrio, setBarrio] = useState<string>('Santiago de Surco');

  // Filtros y búsqueda conectada al servidor
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Modal de confirmación de borrado
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const ageNumber = Number(edad);
  const isAgeInvalid = edad !== '' && (Number.isNaN(ageNumber) || ageNumber < 0 || ageNumber > 100);

  // Búsqueda en vivo contra SQL Server (GET /api/pacientes?buscar=...)
  useEffect(() => {
    const timer = setTimeout(() => {
      searchPatientsFromApi(searchQuery, 100);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery, searchPatientsFromApi]);

  const stats = useMemo(() => {
    const totalBase = Math.max(oltpPacientesCount, patients.length, 1);
    const femCount =
      oltpPacientesFCount > 0
        ? oltpPacientesFCount
        : patients.filter((p) => p.genero === 'F').length;
    const mascCount =
      oltpPacientesMCount > 0 ? oltpPacientesMCount : Math.max(0, totalBase - femCount);

    const districtCounts: Record<string, number> = {};
    patients.forEach((p) => {
      districtCounts[p.barrio] = (districtCounts[p.barrio] || 0) + 1;
    });
    const topDistrict =
      oltpTopBarrio ||
      Object.entries(districtCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      'Surco';

    return {
      totalBase: totalBase.toLocaleString('es-PE'),
      femCount: femCount.toLocaleString('es-PE'),
      femPct: ((femCount / totalBase) * 100).toFixed(1),
      mascCount: mascCount.toLocaleString('es-PE'),
      mascPct: ((mascCount / totalBase) * 100).toFixed(1),
      topDistrict: topDistrict.replace('Santiago de ', ''),
    };
  }, [patients, oltpPacientesCount, oltpPacientesFCount, oltpPacientesMCount, oltpTopBarrio]);

  const filteredPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return patients.filter((p) => {
      const matchesQ =
        !q ||
        p.idPaciente.toLowerCase().includes(q) ||
        p.barrio.toLowerCase().includes(q);
      const matchesGender = genderFilter === 'all' || p.genero === genderFilter;
      let matchesAge = true;
      if (ageFilter === 'pediatric') matchesAge = p.edad <= 14;
      else if (ageFilter === 'adult') matchesAge = p.edad >= 15 && p.edad <= 59;
      else if (ageFilter === 'senior') matchesAge = p.edad >= 60;
      return matchesQ && matchesGender && matchesAge;
    });
  }, [patients, searchQuery, genderFilter, ageFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize));
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const resetForm = () => {
    setEditingPatientId(null);
    setIdPaciente('');
    setGenero('F');
    setEdad('32');
    setBarrio('Santiago de Surco');
  };

  const handleOpenNew = () => {
    resetForm();
    setFormOpen(true);
  };

  const handleEdit = (p: Patient) => {
    setEditingPatientId(p.idPaciente);
    setIdPaciente(p.idPaciente);
    setGenero(p.genero);
    setEdad(String(p.edad));
    setBarrio(p.barrio);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAgeInvalid || edad === '') return;

    if (editingPatientId) {
      const existing = patients.find((p) => p.idPaciente === editingPatientId);
      if (!existing) return;
      const ok = await updatePatient({
        ...existing,
        genero,
        edad: ageNumber,
        barrio,
      });
      if (ok) {
        resetForm();
        setFormOpen(false);
      }
    } else {
      const ok = await addPatient({
        idPaciente: idPaciente.trim(),
        genero,
        edad: ageNumber,
        barrio,
      });
      if (ok) {
        resetForm();
        setFormOpen(false);
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const res = await deletePatient(deleteTarget.idPaciente);
    if (res.ok) {
      setDeleteTarget(null);
      setDeleteError(null);
    } else {
      setDeleteError(res.reason || 'Conflicto de clave foránea.');
    }
  };

  const handleExportCsv = () => {
    const header = 'IdPaciente,Genero,Edad,Barrio,EstadoClinico,Citas\n';
    const body = patients
      .map(
        (p) =>
          `${p.idPaciente},${p.genero},${p.edad},"${p.barrio}","${p.estadoClinico}",${p.citasCount}`
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `padron_pacientes_oltp_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('Exportación CSV Completa', `${patients.length} expedientes exportados correctamente.`);
  };

  return (
    <div className="flex flex-col w-full gap-5">
      {/* CABECERA & METRICS */}
      <section className="flex flex-col gap-4 bg-surface-container-lowest p-5 lg:p-6 rounded-xl shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary font-code-sm">
                Esquema: oltp.Pacientes (IdPaciente, Genero, Edad, Barrio)
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-code-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                FK Enforced: ON
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-code-sm">
                Edad: 0 a 100
              </span>
            </div>
            <h1 className="font-display-lg text-on-surface tracking-tight">
              Gestión de Pacientes — Módulo Transaccional OLTP
            </h1>
            <p className="font-body-md text-on-surface-variant max-w-3xl">
              Padrón maestro clínico en{' '}
              <span className="font-code-sm text-primary">DentalCenterDB</span> sincronizado directamente con{' '}
              <span className="font-code-sm text-primary">oltp.Pacientes</span> y{' '}
              <span className="font-code-sm text-primary">dm.Dim_Paciente</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center shrink-0">
            <button
              type="button"
              onClick={handleOpenNew}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-on-primary font-label-md shadow-sm hover:opacity-95 transition-all whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              <span>+ Registrar Nuevo Paciente</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-container-low text-primary font-label-md hover:bg-surface-container transition-colors whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">file_download</span>
              <span>Exportar Padrón (CSV)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="bg-surface-container-low p-4 rounded-xl flex flex-col gap-1">
            <span className="font-label-sm text-on-surface-variant uppercase tracking-wider">
              Total Pacientes Activos
            </span>
            <span className="font-display-lg text-primary tracking-tight font-bold">
              {stats.totalBase}
            </span>
            <span className="font-body-sm text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-emerald-600">
                database
              </span>
              Registros en oltp.Pacientes
            </span>
          </div>

          <div className="bg-surface-container-low p-4 rounded-xl flex flex-col gap-1">
            <span className="font-label-sm text-on-surface-variant uppercase tracking-wider">
              Población Femenina
            </span>
            <span className="font-display-lg text-on-surface tracking-tight font-bold">
              {stats.femCount}
            </span>
            <span className="font-body-sm text-on-surface-variant">{stats.femPct}% del padrón total</span>
          </div>

          <div className="bg-surface-container-low p-4 rounded-xl flex flex-col gap-1">
            <span className="font-label-sm text-on-surface-variant uppercase tracking-wider">
              Población Masculina
            </span>
            <span className="font-display-lg text-on-surface tracking-tight font-bold">
              {stats.mascCount}
            </span>
            <span className="font-body-sm text-on-surface-variant">{stats.mascPct}% del padrón total</span>
          </div>

          <div className="bg-surface-container-low p-4 rounded-xl flex flex-col gap-1">
            <span className="font-label-sm text-on-surface-variant uppercase tracking-wider">
              Barrio Prevalente
            </span>
            <span className="font-display-lg text-secondary tracking-tight font-bold truncate">
              {stats.topDistrict}
            </span>
            <span className="font-body-sm text-on-surface-variant">Mayor concentración en BD</span>
          </div>
        </div>
      </section>

      {/* FORMULARIO COLLAPSIBLE (solo columnas reales de oltp.Pacientes) */}
      {formOpen && (
        <section className="bg-surface-container-lowest p-5 lg:p-6 rounded-xl shadow-sm">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-surface-container">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[22px]">assignment_add</span>
              </div>
              <div>
                <h2 className="font-headline-sm text-on-surface">
                  {editingPatientId
                    ? `Editar Registro en oltp.Pacientes: #${editingPatientId}`
                    : 'Registrar Paciente en oltp.Pacientes'}
                </h2>
                <p className="font-body-sm text-on-surface-variant">
                  Inserción directa sobre las 4 columnas de oltp.Pacientes: IdPaciente, Genero, Edad y Barrio.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="w-8 h-8 rounded-full bg-surface-container-low text-on-surface-variant hover:bg-surface-container flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="font-label-md text-on-surface font-semibold">
                  IdPaciente (DNI / HC) *
                </label>
                <span className="font-code-sm text-on-surface-variant">BIGINT (PK)</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 material-symbols-outlined text-[18px] text-on-surface-variant">
                  badge
                </span>
                <input
                  type="text"
                  maxLength={15}
                  required
                  readOnly={Boolean(editingPatientId)}
                  value={idPaciente}
                  onChange={(e) => setIdPaciente(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej. 45892110"
                  className={`w-full pl-9 pr-8 py-2 rounded-lg bg-surface-container-low font-code-md text-on-surface focus:outline-none focus:bg-surface-container placeholder:text-on-surface-variant/50 transition-colors ${
                    editingPatientId ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                />
                <span
                  className="absolute right-2.5 top-2.5 material-symbols-outlined text-[18px] text-emerald-600"
                  title="Clave Primaria Numérica"
                >
                  verified
                </span>
              </div>
              <span className="font-body-sm text-on-surface-variant">
                Identificador entero único en oltp.Pacientes.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="font-label-md text-on-surface font-semibold">Género *</label>
                <select
                  value={genero}
                  onChange={(e) => setGenero(e.target.value as GenderCode)}
                  className="w-full py-2 px-3 rounded-lg bg-surface-container-low font-label-md text-on-surface focus:outline-none focus:bg-surface-container transition-colors"
                >
                  <option value="F">Femenino (F)</option>
                  <option value="M">Masculino (M)</option>
                </select>
                <span className="font-body-sm text-on-surface-variant">CHAR(1)</span>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="font-label-md text-on-surface font-semibold">Edad *</label>
                  <span className="font-code-sm text-on-surface-variant">SMALLINT</span>
                </div>
                <input
                  type="number"
                  required
                  value={edad}
                  onChange={(e) => setEdad(e.target.value)}
                  placeholder="0-100"
                  className="w-full px-3 py-2 rounded-lg bg-surface-container-low font-code-md text-on-surface focus:outline-none focus:bg-surface-container transition-colors"
                />
                {isAgeInvalid && (
                  <span className="font-code-sm text-error font-medium">
                    Rango válido: 0 a 100
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="font-label-md text-on-surface font-semibold">
                  Barrio / Distrito *
                </label>
                <span className="font-code-sm text-on-surface-variant">NVARCHAR(100)</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 material-symbols-outlined text-[18px] text-on-surface-variant">
                  location_on
                </span>
                <select
                  value={barrio}
                  onChange={(e) => setBarrio(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-container-low font-body-md text-on-surface focus:outline-none focus:bg-surface-container transition-colors"
                >
                  {!LIMA_DISTRICTS.includes(barrio) && barrio && (
                    <option value={barrio}>{barrio}</option>
                  )}
                  {LIMA_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <span className="font-body-sm text-on-surface-variant">
                Columna Barrio en oltp.Pacientes y dm.Dim_Paciente.
              </span>
            </div>

            <div className="col-span-1 md:col-span-3 flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg bg-surface-container text-on-surface-variant font-label-md hover:text-on-surface transition-colors"
              >
                Limpiar Campos
              </button>
              <button
                type="submit"
                disabled={isAgeInvalid}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-primary text-on-primary font-label-md shadow-sm hover:opacity-95 transition-all disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {editingPatientId ? 'sync' : 'database'}
                </span>
                <span>
                  {editingPatientId ? 'Actualizar en oltp.Pacientes' : 'Guardar en oltp.Pacientes'}
                </span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TABLA OPERATIVA CRUD */}
      <section className="flex flex-col bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-lg">
            <span className="absolute left-3.5 top-2.5 material-symbols-outlined text-[20px] text-on-surface-variant">
              search
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar en SQL Server por IdPaciente o Barrio..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface-container-low font-body-md text-on-surface focus:outline-none focus:bg-surface-container placeholder:text-on-surface-variant/60 transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-surface-container-low p-1 rounded-xl">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'F', label: 'Femenino' },
                  { id: 'M', label: 'Masculino' },
                ] as const
              ).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setGenderFilter(g.id);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 rounded-lg font-label-sm transition-colors ${
                    genderFilter === g.id
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <select
              value={ageFilter}
              onChange={(e) => {
                setAgeFilter(e.target.value as AgeFilter);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 rounded-xl bg-surface-container-low font-label-sm text-on-surface-variant focus:outline-none focus:bg-surface-container"
            >
              <option value="all">Todas las Etapas Etarias</option>
              <option value="pediatric">Pediátrico (0 - 14 años)</option>
              <option value="adult">Adulto (15 - 59 años)</option>
              <option value="senior">Adulto Mayor (60+ años)</option>
            </select>

            <span className="hidden xl:inline text-on-surface-variant font-code-sm pl-2">
              Mostrando <span className="font-bold text-on-surface">{paginatedPatients.length}</span> de{' '}
              {stats.totalBase}
            </span>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant font-label-sm uppercase tracking-wider">
                <th className="py-3 px-4">IdPaciente (PK)</th>
                <th className="py-3 px-4">Género</th>
                <th className="py-3 px-4">Edad</th>
                <th className="py-3 px-4">Barrio / Distrito</th>
                <th className="py-3 px-4">Historial Citas</th>
                <th className="py-3 px-4">Último Tratamiento</th>
                <th className="py-3 px-4 text-right">Acciones Operativas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md">
              {paginatedPatients.map((p) => {
                const ageStage = p.edad <= 14 ? 'Pediátrico' : p.edad >= 60 ? 'Mayor' : 'Adulto';
                return (
                  <tr key={p.idPaciente} className="hover:bg-surface-container-low/60 transition-colors">
                    <td className="py-3 px-4 font-code-sm text-primary font-semibold whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                          badge
                        </span>
                        <span>{p.idPaciente}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full font-label-sm ${
                          p.genero === 'F'
                            ? 'bg-surface-container-high text-primary'
                            : 'bg-surface-container-low text-on-surface-variant'
                        }`}
                      >
                        {p.genero === 'F' ? 'F (Fem)' : 'M (Masc)'}
                      </span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-code-sm font-semibold">{p.edad} años</span>
                        <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px] font-medium">
                          {ageStage}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px] text-secondary">
                          location_on
                        </span>
                        <span>{p.barrio}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-code-sm text-on-surface font-medium">
                          {p.citasCount} citas registradas
                        </span>
                        <span className="font-body-sm text-on-surface-variant">
                          Últ: {p.ultimaCita}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm ${
                          p.etapaBadge === 'active'
                            ? 'bg-surface-container-high text-primary'
                            : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            p.etapaBadge === 'active' ? 'bg-primary' : 'bg-outline'
                          }`}
                        />
                        {p.estadoClinico}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(p)}
                          title="Editar registro"
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigateToAppointmentForPatient(p.idPaciente)}
                          title="Agendar cita en el módulo IA"
                          className="px-2.5 py-1 rounded-lg bg-surface-container-low text-primary font-label-sm hover:bg-surface-container transition-colors flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">calendar_add_on</span>
                          <span>+ Cita</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(p);
                          }}
                          title="Eliminar paciente"
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-error transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="p-4 bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-surface-container-low">
          <span className="font-body-sm text-on-surface-variant">
            Padrón indexado por clave primaria{' '}
            <code className="font-code-sm bg-surface-container px-1.5 py-0.5 rounded">
              PK_Pacientes_IdPaciente
            </code>
            .
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-lg bg-surface-container-low text-on-surface-variant font-label-sm hover:bg-surface-container disabled:opacity-50"
            >
              Anterior
            </button>
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded-lg font-label-sm font-semibold ${
                  currentPage === page
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded-lg bg-surface-container-low text-on-surface-variant font-label-sm hover:bg-surface-container disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>

      {/* PANEL INFERIOR TÉCNICO */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-primary">
            <span className="material-symbols-outlined text-[20px]">fact_check</span>
            <h3 className="font-headline-sm text-on-surface">Reglas de Calidad ETL</h3>
          </div>
          <p className="font-body-sm text-on-surface-variant">
            Validaciones activas en stg.usp_CargarOLTP hacia oltp.Pacientes:
          </p>
          <ul className="flex flex-col gap-2 font-body-sm text-on-surface">
            <li className="flex items-start gap-2 bg-surface-container-low p-2.5 rounded-lg">
              <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5 shrink-0">
                check
              </span>
              <span>
                <strong>Validación de IdPaciente:</strong> Registros en notación científica o inválidos se derivan a stg.Rechazos_Ingesta.
              </span>
            </li>
            <li className="flex items-start gap-2 bg-surface-container-low p-2.5 rounded-lg">
              <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5 shrink-0">
                check
              </span>
              <span>
                <strong>Rango Etario:</strong> Registros con edad &lt; 0 o &gt; 100 son aislados en stg.Rechazos_Ingesta.
              </span>
            </li>
          </ul>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-secondary">
            <span className="material-symbols-outlined text-[20px]">speed</span>
            <h3 className="font-headline-sm text-on-surface">Estructura Relacional DDL</h3>
          </div>
          <p className="font-body-sm text-on-surface-variant">
            Definición física en 01_DDL_Creacion_Estructura.sql:
          </p>
          <div className="flex flex-col gap-2 font-code-sm">
            <div className="p-2.5 rounded-lg bg-surface-container-low text-on-surface flex items-center justify-between">
              <span className="font-medium text-primary">oltp.Pacientes (IdPaciente)</span>
              <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">
                BIGINT PK
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-container-low text-on-surface flex items-center justify-between">
              <span className="font-medium text-secondary">dm.Dim_Paciente (SK_Paciente)</span>
              <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">
                INT IDENTITY PK
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-container-low text-on-surface flex items-center justify-between">
              <span className="font-medium text-tertiary">FK_Citas_Pacientes</span>
              <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">
                oltp.Citas
              </span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-on-surface">
              <span className="material-symbols-outlined text-[20px] text-primary">history_edu</span>
              <h3 className="font-headline-sm text-on-surface">Auditoría en Tiempo Real</h3>
            </div>
            <span className="font-code-sm text-emerald-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Activo
            </span>
          </div>
          <div className="flex flex-col gap-2 font-code-sm">
            {auditEvents.slice(0, 3).map((ev) => (
              <div
                key={ev.id}
                className="p-2.5 rounded-lg bg-surface-container-low text-on-surface-variant flex flex-col"
              >
                <div className="flex justify-between items-center text-[11px] text-on-surface-variant/80">
                  <span>
                    [{ev.time}] {ev.op}
                  </span>
                  <span>{ev.proc}</span>
                </div>
                <span
                  className={`font-medium ${
                    ev.status === 'warn' ? 'text-error' : 'text-emerald-700'
                  }`}
                >
                  {ev.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DELETE MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-inverse-surface/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface-container-lowest p-6 rounded-xl shadow-xl flex flex-col gap-4">
            <div className="flex items-center gap-3 text-error">
              <div className="w-10 h-10 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">gavel</span>
              </div>
              <div>
                <h4 className="font-headline-sm text-on-surface">Validación de Clave Foránea</h4>
                <span className="font-code-sm text-on-surface-variant">FK_Citas_Pacientes</span>
              </div>
            </div>

            <div className="bg-surface-container-low p-4 rounded-lg flex flex-col gap-1.5">
              <p className="font-body-md text-on-surface">
                ¿Confirma la eliminación del paciente con IdPaciente{' '}
                <code className="font-code-sm text-primary font-bold">
                  {deleteTarget.idPaciente}
                </code>{' '}
                ({deleteTarget.barrio}) de <code className="font-code-sm">oltp.Pacientes</code>?
              </p>
              <span className="font-body-sm text-on-surface-variant">
                Citas vinculadas detectadas: <strong>{deleteTarget.citasCount}</strong>
              </span>
            </div>

            {deleteError && (
              <div className="p-3 rounded-lg bg-error-container text-on-error-container font-body-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                  block
                </span>
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label-md hover:bg-surface-container-high transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-error text-on-error font-label-md hover:opacity-90 transition-opacity flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                <span>Ejecutar DELETE</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
