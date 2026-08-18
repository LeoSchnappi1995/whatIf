import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import RoutesComponent from './app.tsx';
import './index.css';
import { createPortal } from 'react-dom';
import { Toaster } from '@client/src/components/ui/sonner';
import { getAppBasePath } from '@/lib/app-base-path';

const CLIENT_BASE_PATH = getAppBasePath();

function FallbackError({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
      <h2>出错了</h2>
      <p style={{ color: '#666' }}>{error.message}</p>
      <button onClick={resetErrorBoundary} style={{ marginTop: 12, padding: '8px 16px' }}>重试</button>
    </div>
  );
}

const MainApp = () => {
  return (
    <BrowserRouter basename={CLIENT_BASE_PATH}>
      <div className="app-root">
        <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => (
          <FallbackError error={error as Error} resetErrorBoundary={resetErrorBoundary} />
        )}>
          <RoutesComponent />
          {createPortal(<Toaster />, document.body)}
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  );
};

createRoot(document.getElementById('root')!).render(<MainApp />);
