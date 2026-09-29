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
      <div style={{
        backgroundColor: '#18181B',
        color: '#FFFFFF',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '13px',
        borderBottom: '1px solid #27272A',
        position: 'sticky',
        top: 0,
        zIndex: 9999
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            backgroundColor: '#D92D20', 
            display: 'inline-block' 
          }}></span>
          <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>DineFlow MVP</span>
          <span style={{ color: '#71717A' }}>|</span>
          <span style={{ color: '#A1A1AA' }}>Current View: <strong>{activeMode === 'dashboard' ? 'Restaurant Staff Dashboard' : 'Customer Mobile View (QR)'}</strong></span>
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => switchMode('dashboard')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              border: 'none',
              background: activeMode === 'dashboard' ? '#D92D20' : '#27272A',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              transition: 'all 0.15s ease'
            }}
          >
            👨‍🍳 Restaurant Dashboard
          </button>
          <button
            onClick={() => switchMode('customer')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              border: 'none',
              background: activeMode === 'customer' ? '#D92D20' : '#27272A',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
              transition: 'all 0.15s ease'
            }}
          >
            📱 Customer Mobile (QR)
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
