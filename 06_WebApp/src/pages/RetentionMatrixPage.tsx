import React, { useMemo, useState } from 'react';
import { SqlConsole } from '../components/SqlConsole';
import { useClinical } from '../context/ClinicalContext';
import { DataMartRetentionRow } from '../types/clinical';

type RiskFilter = 'all' | 'high' | 'medium' | 'low';

function getRiskLevel(prob: number): 'high' | 'medium' | 'low' {
  if (prob >= 50) return 'high';
  if (prob >= 25) return 'medium';
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
        c.paciente.toLowerCase().includes(q) ||
        c.dni.includes(q) ||
        c.idCita.toLowerCase().includes(q) ||
        c.skPaciente.toLowerCase().includes(q);

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
      `Estimado(a) ${row.paciente}, le saludamos de Sonrisa Integral (Sede Miraflores). Le recordamos su cita hoy a las ${row.hora} para ${row.tratamiento} con ${row.medico}. Por favor responda SI para confirmar su asistencia o comuníquese al (01) 640-2000.`
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

  const handleDispatchWhatsApp = async () => {
    if (!modalRow) return;
    const targetRow = modalRow;
    setModalRow(null);
    const cleanPhone = targetRow.telefono.replace(/[^0-9]/g, '');
    appendSqlLog(
      'DISPATCH',
      `Recordatorio WhatsApp despachado para Paciente ${targetRow.skPaciente} (+${cleanPhone}).`,
      'cmd'
    );
    if (targetRow.smsRecibido === 0) {
      await confirmRetentionSmsWriteBack(targetRow.idCita);
    }
    pushToast('WhatsApp Despachado', `Mensaje en cola de salida hacia ${targetRow.telefono}.`);
  };

  const handleDispatchTwilio = async () => {
    if (!modalRow) return;
    const targetRow = modalRow;
    setModalRow(null);
    const sid = `SM_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    appendSqlLog(
      'GATEWAY_TWILIO',
      `SMS programado y despachado con éxito a ${targetRow.telefono} (SID: ${sid}).`,
      'success'
    );
    if (targetRow.smsRecibido === 0) {
      await confirmRetentionSmsWriteBack(targetRow.idCita);
    }
    pushToast('SMS Twilio Enviado', `SMS enviado correctamente al número ${targetRow.telefono}.`);
  };

  return (
    <div className="flex flex-col w-full gap-5">
      {/* HEADER CARD */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface-container-lowest p-5 lg:p-6 rounded-xl shadow-sm">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-code-sm text-primary bg-primary-fixed px-2.5 py-0.5 rounded-full font-semibold">
              dm.Fact_Atenciones + Scoring IA
            </span>
            <span className="font-label-sm text-on-surface-variant flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Modelo Random Forest v2.4 (AUC: 0.892)
            </span>
          </div>
          <h1 className="font-headline-md text-on-surface font-bold tracking-tight">
            Agenda Inteligente &amp; Retención Clínica
          </h1>
          <p className="font-body-sm text-on-surface-variant max-w-3xl">
            Monitor prescriptivo de no-show para la jornada actual en Sede Central Lima. Cruce multidimensional entre dimensiones del Data Mart y cálculo de riesgo en tiempo real con Write-Back a{' '}
            <code className="font-code-sm text-primary font-bold">oltp.Citas</code>.
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
                {summary.high} en Riesgo Crítico
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
              placeholder="Buscar por Nombre de Paciente, DNI (ej. 45892110) o IdCita (#CT-1092)..."
              className="w-full bg-surface-container-low pl-10 pr-4 py-2 rounded-lg font-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-surface-container-low p-1 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Todos', count: summary.total, pillClass: 'opacity-80' },
                  { id: 'high', label: 'Riesgo Alto', count: summary.high, pillClass: 'px-1.5 rounded-full bg-error/15 text-error font-bold' },
                  { id: 'medium', label: 'Riesgo Medio', count: summary.medium, pillClass: 'px-1.5 rounded-full bg-amber-500/15 text-amber-800 font-bold' },
                  { id: 'low', label: 'Riesgo Bajo', count: summary.low, pillClass: 'px-1.5 rounded-full bg-emerald-600/15 text-emerald-800 font-bold' },
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
              <option value="Periodoncia">Periodoncia</option>
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
              Vista en vivo: Sede Lima Miraflores
            </span>
            <span className="text-outline-variant">|</span>
            <span>
              Mostrando {filteredRows.length} de {retentionRows.length} citas registradas
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-on-surface font-medium">
            <span className="material-symbols-outlined text-[16px] text-primary">touch_app</span>
            <span>Clic en "Confirmar SMS" ejecuta Write-Back SQL</span>
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
                <th className="py-3 px-4 font-semibold">Paciente (Data Mart)</th>
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
                        {c.idCita}
                      </span>
                      <div className="font-code-sm text-outline mt-0.5">{c.hora}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-label-md font-bold text-on-surface leading-tight">
                        {c.paciente}
                      </div>
                      <div className="font-code-sm text-on-surface-variant flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span>DNI: {c.dni}</span>
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
                          c.tiempoEspera > 20 ? 'text-error font-bold' : 'text-on-surface'
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
                        <span className="font-label-sm text-outline text-[10px]">p(no-show)</span>
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
                          title="Contactar Paciente (WhatsApp/SMS)"
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
                              ? 'Enviando...'
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
              No se encontraron citas con los filtros seleccionados
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
            subtitle="SQL Server Listener LIM-SRV-DATA01 • DB: DentalCenterDB"
            variant="compact"
          />
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">psychology</span>
            </div>
            <div>
              <h2 className="font-headline-sm font-bold text-on-surface">SHAP Explainer IA</h2>
              <p className="font-label-sm text-on-surface-variant">Drivers de Riesgo en Ausentismo</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-label-sm">
                <span className="text-on-surface font-medium">
                  SMS No Confirmado (SMSRecibido = 0)
                </span>
                <span className="text-error font-bold font-code-sm">+34.8% peso</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div className="h-full bg-error rounded-full" style={{ width: '82%' }} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-label-sm">
                <span className="text-on-surface font-medium">Tiempo de Espera &gt; 15 Días</span>
                <span className="text-amber-700 font-bold font-code-sm">+26.4% peso</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: '65%' }} />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-label-sm">
                <span className="text-on-surface font-medium">
                  Distrito periférico vs Sede Miraflores
                </span>
                <span className="text-secondary font-bold font-code-sm">+18.1% peso</span>
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
                Al registrar <strong className="text-on-surface">SMSRecibido = 1</strong> en base de datos, el algoritmo recalcula la inferencia restando entre un 25% y 35% de probabilidad de abandono.
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
                    Enviar Recordatorio Clínico
                  </h3>
                  <p className="font-label-sm text-on-surface-variant">
                    Paciente: {modalRow.paciente} | Cita #{modalRow.idCita}
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
                Plantilla generada (Optimizada con NLP preventivo):
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

            <div className="p-3 bg-surface-container-low rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-secondary text-[20px]">
                  phone_iphone
                </span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-on-surface-variant">
                    Teléfono móvil registrado:
                  </span>
                  <span className="font-code-sm font-bold text-on-surface">{modalRow.telefono}</span>
                </div>
              </div>
              <span className="font-code-sm px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                Opt-in Activo
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={() => setModalRow(null)}
                className="px-4 py-2 rounded-lg font-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDispatchTwilio}
                className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-label-md flex items-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">sms</span>
                SMS Twilio
              </button>
              <button
                type="button"
                onClick={handleDispatchWhatsApp}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 font-label-md flex items-center gap-1.5 shadow-sm transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">chat</span>
                Enviar WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
