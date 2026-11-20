import React, { useEffect, useRef } from 'react';
import { useClinical } from '../context/ClinicalContext';

interface SqlConsoleProps {
  title: string;
  subtitle?: string;
  variant?: 'compact' | 'full';
}

export const SqlConsole: React.FC<SqlConsoleProps> = ({
  title,
  subtitle = 'SQL Server 2022 Developer (Localhost:1433) • DB: DentalCenterDB',
  variant = 'compact',
}) => {
  const { sqlLogs, clearSqlLogs } = useClinical();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sqlLogs]);

  const toneClass = (tone: string) => {
    switch (tone) {
      case 'success':
        return 'text-emerald-400';
      case 'cmd':
        return 'text-sky-300';
      case 'warn':
        return 'text-amber-300';
      case 'error':
        return 'text-rose-400';
      default:
        return 'text-slate-300';
    }
  };

  if (variant === 'full') {
    return (
      <div className="bg-inverse-surface text-inverse-on-surface rounded-xl overflow-hidden shadow-lg flex flex-col">
        <div className="bg-slate-900 px-4 py-2.5 flex items-center justify-between border-b border-slate-800 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
            </div>
            <span className="ml-2 font-code-sm text-slate-300 font-medium flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-secondary-fixed-dim">
                terminal
              </span>
              {title}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={clearSqlLogs}
              className="px-2.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-code-sm transition-colors"
            >
              Limpiar Pantalla
            </button>
            <span className="font-code-sm text-emerald-400">STATUS: LISTENING</span>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="p-4 font-code-sm leading-relaxed max-h-72 overflow-y-auto terminal-scroll flex flex-col gap-1.5 bg-[#0b1329]"
        >
          {sqlLogs.map((log) => (
            <div key={log.id} className={`${toneClass(log.tone)} break-words`}>
              <span className="text-slate-500">[{log.timestamp}]</span>{' '}
              <span className="text-secondary-fixed-dim">[{log.prefix}]</span> {log.message}
            </div>
          ))}
        </div>

        <div className="bg-slate-900/90 px-4 py-2 border-t border-slate-800 flex items-center justify-between text-slate-400 font-code-sm flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">&gt;</span>
            <span className="text-slate-300">
              T-SQL Query Console activa con aislamiento READ COMMITTED SNAPSHOT
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              Buffer Pool: <strong className="text-slate-200">14.8 GB</strong>
            </span>
            <span>
              CPU Temp: <strong className="text-emerald-400">42°C</strong>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-[20px]">terminal</span>
          </div>
          <div>
            <h2 className="font-headline-sm font-bold text-on-surface">{title}</h2>
            <p className="font-code-sm text-on-surface-variant">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-code-sm text-emerald-800 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Replicación CDC Activa
          </span>
          <button
            type="button"
            onClick={clearSqlLogs}
            className="font-label-sm text-on-surface-variant hover:text-on-surface underline"
          >
            Limpiar Log
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="w-full bg-[#0b1329] text-inverse-on-surface rounded-lg p-3.5 font-code-sm max-h-52 overflow-y-auto terminal-scroll shadow-inner flex flex-col gap-1.5"
      >
        {sqlLogs.map((log) => (
          <div key={log.id} className={`${toneClass(log.tone)} leading-snug break-words`}>
            <span className="text-slate-500">[{log.timestamp.slice(11, 19)}]</span>{' '}
            <span className="text-sky-400">{log.prefix}:</span> {log.message}
          </div>
        ))}
      </div>
    </div>
  );
};
