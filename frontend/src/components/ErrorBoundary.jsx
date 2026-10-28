import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// Keeps one broken page from blanking the whole app; resets when the route changes.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center bg-white rounded-2xl border border-slate-200 shadow-card p-10">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Something went wrong on this page</h1>
          <p className="mt-2 text-sm text-slate-600">The rest of ChargeMate still works. Try reloading this page.</p>
          <button onClick={() => window.location.reload()} className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700">
            <RotateCcw className="w-4 h-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}
