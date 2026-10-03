import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { MeasurementReportData } from '@/components/measurement-report';

type MeasurementReportContextValue = {
  report: MeasurementReportData | null;
  setReport: (report: MeasurementReportData) => void;
  clearReport: () => void;
};

const MeasurementReportContext = createContext<MeasurementReportContextValue | null>(null);

export function MeasurementReportProvider({ children }: { children: ReactNode }) {
  const [report, setReportState] = useState<MeasurementReportData | null>(null);
  const setReport = useCallback((nextReport: MeasurementReportData) => {
    setReportState(nextReport);
  }, []);
  const clearReport = useCallback(() => setReportState(null), []);

  return (
    <MeasurementReportContext.Provider value={{ report, setReport, clearReport }}>
      {children}
    </MeasurementReportContext.Provider>
  );
}

export function useMeasurementReport() {
  const context = useContext(MeasurementReportContext);
  if (!context) {
    throw new Error('useMeasurementReport must be used within MeasurementReportProvider.');
  }
  return context;
}