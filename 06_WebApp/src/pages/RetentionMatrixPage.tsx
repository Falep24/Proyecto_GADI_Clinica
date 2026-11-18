import React, { useMemo, useState } from 'react';
import { SqlConsole } from '../components/SqlConsole';
import { useClinical } from '../context/ClinicalContext';
import { DataMartRetentionRow } from '../types/clinical';

type RiskFilter = 'all' | 'high' | 'medium' | 'low';

// Umbrales unificados con el modelo Random Forest y el backend FastAPI (Alto >= 50%, Medio >= 35%)
function getRiskLevel(prob: number): 'high' | 'medium' | 'low' {
  if (prob >= 50) return 'high';
  if (prob >= 35) return 'medium';
  return 'low';
}

export const RetentionMatrixPage: React.FC = () => {
  const { retentionRows, confirmRetentionSmsWriteBack, appendSqlLog, pushToast } = useClinical();

  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [smsFilter, setSmsFilter] = useState('all');

  const [modalRow, setModalRow] = useState<DataMartRetentionRow | null>(null);
  const [modalBody, setModalBody] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const summary = useMemo(() => {
    let high = 0;
    let medium = 0;
    let low = 0;
    let riskCapital = 0;

    retentionRows.forEach((r) => {
      const lvl = getRiskLevel(r.probabilidad);
      if (lvl === 'high') {
        high++;
        riskCapital += r.costo;
      } else if (lvl === 'medium') {
        medium++;
      } else {
        low++;
      }
    });

    return { total: retentionRows.length, high, medium, low, riskCapital };
  }, [retentionRows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return retentionRows.filter((c) => {
      const matchesQ =
        !q ||
        c.dni.toLowerCase().includes(q) ||
        c.idCita.toLowerCase().includes(q) ||
        c.skPaciente.toLowerCase().includes(q) ||
        c.distrito.toLowerCase().includes(q);

      const lvl = getRiskLevel(c.probabilidad);
      const matchesRisk = riskFilter === 'all' || lvl === riskFilter;
      const matchesSpec = specialtyFilter === 'all' || c.especialidad === specialtyFilter;
      const matchesSms = smsFilter === 'all' || String(c.smsRecibido) === smsFilter;
      return matchesQ && matchesRisk && matchesSpec && matchesSms;
    });
  }, [retentionRows, searchQuery, riskFilter, specialtyFilter, smsFilter]);

  const openModal = (row: DataMartRetentionRow) => {
    setModalRow(row);
    setModalBody(
      `Estimado(a) Paciente #${row.dni} (${row.skPaciente}), le saludamos de Sonrisa Integral. Le recordamos su cita #${row.idCita} a las ${row.hora} para ${row.tratamiento} (${row.cpms}) con ${row.medico}. Por favor responda SI para confirmar su asistencia.`
    );
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setRiskFilter('all');
    setSpecialtyFilter('all');
    setSmsFilter('all');
    pushToast('Filtros Restablecidos', 'Mostrando todos los registros del Data Mart.', 'info');
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(modalBody).catch(() => {});
    pushToast('Copiado', 'Plantilla de recordatorio copiada al portapapeles.');
  };

  const handleConfirmFromModal = async () => {
    if (!modalRow) return;
    const targetRow = modalRow;
    setModalRow(null);
    appendSqlLog(
      'WRITE_BACK_REQ',
      `Confirmación de recordatorio registrada para ${targetRow.skPaciente} (IdPaciente: ${targetRow.dni}).`,
      'cmd'
    );
    if (targetRow.smsRecibido === 0) {
      await confirmRetentionSmsWriteBack(targetRow.idCita);
    } else {
      pushToast('Ya Confirmado', `La cita #${targetRow.idCita} ya cuenta con SMSRecibido = 1.`);
    }
  };

  return (
    <div className="flex flex-col w-full gap-5">
      {/* HEADER CARD */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface-container-lowest p-5 lg:p-6 rounded-xl shadow-sm">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-code-sm text-primary bg-primary-fixed px-2.5 py-0.5 rounded-full font-semibold">
              dm.Fact_Atenciones + dm.Resultados_Prediccion_IA
            </span>
            <span className="font-label-sm text-on-surface-variant flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Modelo Random Forest (Umbrales: Alto ≥50%, Medio ≥35%)
            </span>
          </div>
          <h1 className="font-headline-md text-on-surface font-bold tracking-tight">
            Agenda Inteligente &amp; Retención Clínica
          </h1>
          <p className="font-body-sm text-on-surface-variant max-w-3xl">
            Monitor prescriptivo de abandono por paciente único (<code className="font-code-sm text-primary">SK_Paciente</code>) cruzando dimensiones del Data Mart y recalculando la inferencia con <code className="font-code-sm text-primary font-bold">modelo_rf_dental.pkl</code> al ejecutar Write-Back en <code className="font-code-sm text-primary font-bold">oltp.Citas</code>.
          </p>
        </div>

        <div className="flex items-center gap-3 p-3.5 bg-surface-container-low rounded-xl self-start lg:self-auto shrink-0 shadow-inner">
          <div className="w-10 h-10 rounded-lg bg-error-container text-on-error-container flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">crisis_alert</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
              Exposición Financiera Directa
            </span>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="font-display-lg font-bold text-on-surface tracking-tight">
                S/{summary.riskCapital.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="font-label-sm text-error font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-error" />
                {summary.high} en Riesgo Alto
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* FILTER BAR */}
      <section className="flex flex-col gap-3 bg-surface-container-lowest p-4 rounded-xl shadow-sm">
        <div className="flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center">
          <div className="relative flex-1 min-w-[260px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por IdPaciente (DNI), SK_Paciente, Barrio o IdCita..."
              className="w-full bg-surface-container-low pl-10 pr-4 py-2 rounded-lg font-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Todos', count: summary.total, pillClass: 'opacity-80' },
                  { id: 'high', label: 'Riesgo Alto (≥50%)', count: summary.high, pillClass: 'px-1.5 rounded-full bg-error/15 text-error font-bold' },
                  { id: 'medium', label: 'Riesgo Medio (35-49%)', count: summary.medium, pillClass: 'px-1.5 rounded-full bg-amber-500/15 text-amber-800 font-bold' },
                  { id: 'low', label: 'Riesgo Bajo (<35%)', count: summary.low, pillClass: 'px-1.5 rounded-full bg-emerald-600/15 text-emerald-800 font-bold' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRiskFilter(tab.id)}
                  className={`px-3 py-1 rounded-md font-label-sm font-semibold transition-all whitespace-nowrap flex items-center gap-1 ${
                    riskFilter === tab.id
                      ? 'bg-surface-container-lowest text-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={tab.pillClass}>({tab.count})</span>
                </button>
              ))}
            </div>

            <select
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="bg-surface-container-low text-on-surface font-label-md px-3 py-2 rounded-lg focus:outline-none cursor-pointer"
            >
              <option value="all">Todas las Especialidades</option>
              <option value="Odontología General">Odontología General</option>
              <option value="Endodoncia">Endodoncia</option>
              <option value="Ortodoncia">Ortodoncia</option>
            </select>

            <select
              value={smsFilter}
              onChange={(e) => setSmsFilter(e.target.value)}
              className="bg-surface-container-low text-on-surface font-label-md px-3 py-2 rounded-lg focus:outline-none cursor-pointer"
            >
              <option value="all">SMS: Todos</option>
              <option value="0">SMS Pendiente (0)</option>
              <option value="1">SMS Confirmado (1)</option>
            </select>

            <button
              type="button"
              onClick={handleResetFilters}
              title="Restablecer filtros"
              className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">filter_alt_off</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-on-surface-variant font-label-sm flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              Vista deduplicada por SK_Paciente (última atención)
            </span>
            <span className="text-outline-variant">|</span>
            <span>
              Mostrando {filteredRows.length} de {retentionRows.length} pacientes evaluados
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-on-surface font-medium">
            <span className="material-symbols-outlined text-[16px] text-primary">touch_app</span>
            <span>Clic en "Confirmar SMS" ejecuta Write-Back SQL y re-scoring RF</span>
          </div>
        </div>
      </section>

      {/* DATA TABLE */}
      <section className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low font-label-sm text-on-surface-variant uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">IdCita</th>
                <th className="py-3 px-4 font-semibold">IdPaciente &amp; SK_Paciente (DM)</th>
                <th className="py-3 px-4 font-semibold">Especialidad &amp; Médico</th>
                <th className="py-3 px-4 font-semibold">Tratamiento &amp; Tarifa</th>
                <th className="py-3 px-4 font-semibold text-center">Espera</th>
                <th className="py-3 px-4 font-semibold text-center">SMS OLTP</th>
                <th className="py-3 px-4 font-semibold min-w-[140px]">Scoring IA No-Show</th>
                <th className="py-3 px-4 font-semibold">Nivel Riesgo</th>
                <th className="py-3 px-4 font-semibold text-right">Write-Back &amp; Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container font-body-sm text-on-surface">
              {filteredRows.map((c) => {
                const lvl = getRiskLevel(c.probabilidad);
                const progressColor =
                  lvl === 'high' ? 'bg-red-500' : lvl === 'medium' ? 'bg-amber-500' : 'bg-emerald-500';

                return (
                  <tr key={c.idCita} className="hover:bg-primary-fixed/20 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-code-sm font-bold text-primary px-1.5 py-0.5 bg-surface-container-low rounded">
                        #{c.idCita}
                      </span>
                      <div className="font-code-sm text-outline mt-0.5">{c.hora}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-code-sm font-bold text-on-surface leading-tight">
                        IdPaciente: {c.dni}
                      </div>
                      <div className="font-code-sm text-on-surface-variant flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span>{c.skPaciente}</span>
                        <span className="text-outline-variant">&bull;</span>
                        <span>
                          {c.edad} años ({c.genero})
                        </span>
                        <span className="text-outline-variant">&bull;</span>
                        <span className="text-secondary font-medium">{c.distrito}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-body-sm font-medium text-on-surface">{c.medico}</div>
                      <div className="font-label-sm text-primary font-semibold">{c.especialidad}</div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-body-sm text-on-surface font-medium">{c.tratamiento}</div>
                      <div className="font-code-sm text-on-surface-variant flex items-center gap-1.5 mt-0.5">
                        <span className="text-outline">{c.cpms}</span>
                        <span className="text-outline-variant">&bull;</span>
                        <span className="font-bold text-on-surface">S/ {c.costo.toFixed(2)}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span
                        className={`font-code-sm font-semibold ${
                          c.tiempoEspera > 15 ? 'text-error font-bold' : 'text-on-surface'
                        }`}
                      >
                        {c.tiempoEspera} d
                      </span>
                      <div className="font-label-sm text-outline text-[10px]">anticipación</div>
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {c.smsRecibido === 1 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-code-sm font-semibold border border-emerald-200">
                          <span className="material-symbols-outlined text-[13px] text-emerald-600">
                            check
                          </span>
                          1 Confirmado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-code-sm font-medium">
                          <span className="material-symbols-outlined text-[13px] text-outline">
                            hourglass_empty
                          </span>
                          0 Pendiente
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-code-sm font-bold text-on-surface">{c.probabilidad}%</span>
                        <span className="font-label-sm text-outline text-[10px]">p(abandono)</span>
                      </div>
                      <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                        <div
                          className={`${progressColor} h-full rounded-full transition-all duration-500`}
                          style={{ width: `${c.probabilidad}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {lvl === 'high' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 font-label-sm font-bold border border-red-200">
                          <span className="w-2 h-2 rounded-full bg-red-600" /> ALTO
                        </span>
                      ) : lvl === 'medium' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 font-label-sm font-semibold border border-amber-200">
                          <span className="w-2 h-2 rounded-full bg-amber-500" /> MEDIO
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-label-sm font-semibold border border-emerald-200">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" /> BAJO
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openModal(c)}
                          title="Generar plantilla de recordatorio"
                          className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-[19px]">maps_ugc</span>
                        </button>
                        <button
                          type="button"
                          disabled={c.smsRecibido === 1 || confirmingId === c.idCita}
                          onClick={async () => {
                            setConfirmingId(c.idCita);
                            try {
                              await confirmRetentionSmsWriteBack(c.idCita);
                            } finally {
                              setConfirmingId(null);
                            }
                          }}
                          className={`px-2.5 py-1.5 rounded-lg font-label-sm font-semibold transition-all flex items-center gap-1 ${
                            c.smsRecibido === 1
                              ? 'bg-surface-container text-outline cursor-default'
                              : 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm active:scale-95 disabled:opacity-60'
                          }`}
                        >
                          <span className={`material-symbols-outlined text-[15px] ${confirmingId === c.idCita ? 'animate-spin' : ''}`}>
                            {c.smsRecibido === 1 ? 'check_circle' : 'sync'}
                          </span>
                          <span>
                            {c.smsRecibido === 1
                              ? 'Confirmado'
                              : confirmingId === c.idCita
                              ? 'Actualizando...'
                              : 'Confirmar SMS'}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredRows.length === 0 && (
          <div className="p-10 text-center flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-outline text-[44px]">search_off</span>
            <p className="font-headline-sm text-on-surface">
              No se encontraron pacientes con los filtros seleccionados
            </p>
            <p className="font-body-sm text-on-surface-variant">
              Pruebe ajustando los parámetros de búsqueda o restableciendo los selectores.
            </p>
          </div>
        )}
      </section>

      {/* CONSOLE & SHAP EXPLAINER */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SqlConsole
            title="Consola de Transacciones OLTP & Telemetría Write-Back"
            subtitle="SQL Server Listener localhost\\SQLEXPRESS • DB: DentalCenterDB"
            variant="compact"
          />
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">psychology</span>
            </div>
            <div>
              <h2 className="font-headline-sm font-bold text-on-surface">Importancia de Variables RF</h2>
              <p className="font-label-sm text-on-surface-variant">Drivers del Modelo (modelo_rf_dental.pkl)</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-label-sm">
                <span className="text-on-surface font-medium">
                  Promedio / Máximo Días de Espera
                </span>
                <span className="text-error font-bold font-code-sm">Factor Principal</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div className="h-full bg-error rounded-full" style={{ width: '82%' }} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-label-sm">
                <span className="text-on-surface font-medium">Ratio de Confirmación SMS</span>
                <span className="text-amber-700 font-bold font-code-sm">Factor Protector</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: '65%' }} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-label-sm">
                <span className="text-on-surface font-medium">
                  Edad y Costo del Tratamiento
                </span>
                <span className="text-secondary font-bold font-code-sm">Variables Clínicas</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div className="h-full bg-secondary rounded-full" style={{ width: '44%' }} />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-surface-container-low flex items-start gap-2 mt-1">
              <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">
                verified_user
              </span>
              <p className="font-body-sm text-on-surface-variant">
                Al registrar <strong className="text-on-surface">SMSRecibido = 1</strong> en base de datos, el backend actualiza el <strong className="text-on-surface">Ratio_SMS</strong> del paciente y recalcula su probabilidad con <strong className="text-on-surface">modelo_rf_dental.pkl</strong>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* REMINDER MODAL */}
      {modalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60 backdrop-blur-xs">
          <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-6 shadow-xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-surface-container">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">send</span>
                </div>
                <div>
                  <h3 className="font-headline-sm font-bold text-on-surface">
                    Plantilla de Recordatorio Clínico (Simulación)
                  </h3>
                  <p className="font-label-sm text-on-surface-variant">
                    IdPaciente: {modalRow.dni} ({modalRow.skPaciente}) | Cita #{modalRow.idCita}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalRow(null)}
                className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm text-on-surface-variant font-semibold">
                Mensaje de recordatorio generado:
              </label>
              <div className="relative">
                <textarea
                  rows={5}
                  value={modalBody}
                  onChange={(e) => setModalBody(e.target.value)}
                  className="w-full bg-surface-container-low p-3.5 rounded-xl font-code-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="absolute right-2.5 bottom-2.5 px-2.5 py-1 bg-surface-container-highest hover:bg-surface-variant text-on-surface font-label-sm rounded-md flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">content_copy</span>
                  Copiar
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={() => setModalRow(null)}
                className="px-4 py-2 rounded-lg font-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleConfirmFromModal}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 font-label-md flex items-center gap-1.5 shadow-sm transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">sync</span>
                Confirmar SMS (Write-Back SQL)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
