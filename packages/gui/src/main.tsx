import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Unable to find the app root element.');
}

const root = ReactDOM.createRoot(rootElement);
let startupCompleted = false;

class StartupErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: unknown | null }
> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error('startup render failed', error);
  }

  render() {
    if (this.state.error) {
      return buildFatalScreen(this.state.error);
    }

    return this.props.children;
  }
}

function renderFatalScreen(error: unknown) {
  const message = formatFatalMessage(error);
  root.render(
    <React.StrictMode>
      {buildFatalScreen(message)}
    </React.StrictMode>,
  );
}

window.addEventListener('error', event => {
  if (!startupCompleted) {
    renderFatalScreen(event.error ?? event.message);
    return;
  }
  console.error('runtime error', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', event => {
  if (!startupCompleted) {
    renderFatalScreen(event.reason);
    return;
  }
  console.error('unhandled runtime rejection', event.reason);
});

void bootstrap();

async function bootstrap() {
  try {
    const { default: App } = await import('./app/App');
    root.render(
      <React.StrictMode>
        <StartupErrorBoundary>
          <App />
        </StartupErrorBoundary>
      </React.StrictMode>,
    );
    startupCompleted = true;
  } catch (error) {
    renderFatalScreen(error);
  }
}

function formatFatalMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return 'Unknown startup error';
  }
}

function buildFatalScreen(error: unknown) {
  const message = typeof error === 'string' ? error : formatFatalMessage(error);
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <div
        style={{
          width: 'min(720px, 100%)',
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(10, 16, 24, 0.88)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.32)',
          padding: 24,
          color: '#f4f8fb',
          fontFamily: '"Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif',
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#79dcff' }}>
          Startup Error
        </div>
        <h1 style={{ margin: '10px 0 12px', fontSize: 28 }}>
          AlsoMusicPlayer could not finish starting.
        </h1>
        <p style={{ margin: 0, color: '#a8b6c6', lineHeight: 1.6 }}>
          The portable package may be incomplete, or the frontend failed during startup.
        </p>
        <pre
          style={{
            margin: '18px 0 0',
            padding: 16,
            overflow: 'auto',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: '#f4f8fb',
          }}
        >
          {message}
        </pre>
      </div>
    </div>
  );
}
