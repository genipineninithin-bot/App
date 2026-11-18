import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Nexora ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let readableDetail = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed?.error) {
          readableDetail = `${parsed.operationType?.toUpperCase() || 'FIRESTORE'} (${
            parsed.path || 'unknown'
          }): ${parsed.error}`;
        }
      } catch {
        // Plain message string
      }

      return (
        <div className="min-h-screen w-full bg-[#070B13] text-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#0C1322] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h1 className="font-display text-base font-semibold text-slate-100">
                NEXORA AI Operational Notice
              </h1>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed break-words">
              {readableDetail}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[42px] w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              <span>Reload Workspace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
