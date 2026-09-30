import React, { useState, useEffect } from 'react';
import CustomerView from './components/CustomerView';
import DashboardView from './components/DashboardView';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#D92D20' }}>Something went wrong loading DineFlow</h2>
          <p style={{ color: '#52525B', margin: '16px 0' }}>{this.state.error?.message || 'Unknown error'}</p>
          <button 
            onClick={() => { localStorage.clear(); window.location.href = '/'; }}
            style={{ padding: '10px 20px', background: '#D92D20', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            Reset & Reload Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [activeMode, setActiveMode] = useState(() => {
    // If URL contains /restaurant/ default to customer, otherwise dashboard
    return window.location.pathname.includes('/restaurant/') ? 'customer' : 'dashboard';
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      setActiveMode(path.includes('/restaurant/') ? 'customer' : 'dashboard');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Restaurant ID
  let restaurantId = 'rest-dineflow-01';
  const matchCustomer = currentPath.match(/\/restaurant\/([^\/]+)/);
  if (matchCustomer) {
    restaurantId = matchCustomer[1];
  }

  const switchMode = (mode) => {
    setActiveMode(mode);
    if (mode === 'customer') {
      window.history.pushState({}, '', `/restaurant/${restaurantId}`);
      setCurrentPath(`/restaurant/${restaurantId}`);
    } else {
      window.history.pushState({}, '', '/');
      setCurrentPath('/');
    }
  };

  return (
    <ErrorBoundary>
      {/* Floating Mode Switcher Bar */}
      <style>{`
        .app-mode-bar {
          background-color: #18181B;
          color: #FFFFFF;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          border-bottom: 1px solid #27272A;
          position: sticky;
          top: 0;
          z-index: 9999;
          width: 100%;
          box-sizing: border-box;
        }
        .app-mode-info {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .app-mode-buttons {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }
        .app-mode-btn {
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          color: #FFFFFF;
          cursor: pointer;
          font-weight: 600;
          font-size: 12px;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        @media (max-width: 640px) {
          .app-mode-bar {
            padding: 8px 12px;
            gap: 8px;
          }
          .app-mode-label-text {
            display: none;
          }
          .app-mode-buttons {
            display: flex;
            gap: 6px;
          }
          .app-mode-btn {
            padding: 5px 9px;
            font-size: 11.5px;
          }
        }
      `}</style>
      <div className="app-mode-bar">
        <div className="app-mode-info">
          <span style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            backgroundColor: '#D92D20', 
            display: 'inline-block',
            flexShrink: 0 
          }}></span>
          <span style={{ fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>DineFlow</span>
          <span className="app-mode-label-text" style={{ color: '#71717A' }}>|</span>
          <span className="app-mode-label-text" style={{ color: '#A1A1AA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeMode === 'dashboard' ? 'Staff Dashboard' : 'Customer View (QR)'}
          </span>
        </div>

        <div className="app-mode-buttons">
          <button
            onClick={() => switchMode('dashboard')}
            className="app-mode-btn"
            style={{
              background: activeMode === 'dashboard' ? '#D92D20' : '#27272A',
            }}
          >
            👨‍🍳 Dashboard
          </button>
          <button
            onClick={() => switchMode('customer')}
            className="app-mode-btn"
            style={{
              background: activeMode === 'customer' ? '#D92D20' : '#27272A',
            }}
          >
            📱 Customer (QR)
          </button>
        </div>
      </div>

      {activeMode === 'customer' ? (
        <CustomerView 
          restaurantId={restaurantId} 
          onSwitchToDashboard={() => switchMode('dashboard')} 
        />
      ) : (
        <DashboardView 
          restaurantId={restaurantId} 
          onOpenCustomerView={() => switchMode('customer')} 
        />
      )}
    </ErrorBoundary>
  );
}
