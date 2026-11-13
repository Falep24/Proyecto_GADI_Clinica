import React from 'react';
import { AppShell } from './components/AppShell';
import { ClinicalProvider, useClinical } from './context/ClinicalContext';
import { AppointmentsControlPage } from './pages/AppointmentsControlPage';
import { PatientsCrudPage } from './pages/PatientsCrudPage';
import { PowerBiDashboardPage } from './pages/PowerBiDashboardPage';
import { RetentionMatrixPage } from './pages/RetentionMatrixPage';
import { SimulatorEtlPage } from './pages/SimulatorEtlPage';

const ActiveWorkspaceView: React.FC = () => {
  const { activeModule } = useClinical();

  switch (activeModule) {
    case 'inteligencia-de-negocios':
      return <PowerBiDashboardPage />;
    case 'agenda-inteligente-y-retencion':
      return <RetentionMatrixPage />;
    case 'simulador-prescriptivo-y-pipeline-etl':
      return <SimulatorEtlPage />;
    case 'gestion-de-pacientes':
      return <PatientsCrudPage />;
    case 'agendamiento-y-control-de-citas':
      return <AppointmentsControlPage />;
    default:
      return <PowerBiDashboardPage />;
  }
};

export default function App() {
  return (
    <ClinicalProvider>
      <AppShell>
        <ActiveWorkspaceView />
      </AppShell>
    </ClinicalProvider>
  );
}
