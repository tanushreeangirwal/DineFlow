import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Clock, 
  CheckCircle2, 
  Sparkles, 
  Bell, 
  ArrowRight, 
  Smartphone, 
  UtensilsCrossed, 
  RefreshCw, 
  Info,
  ChevronRight,
  MapPin,
  ExternalLink,
  Receipt,
  CreditCard,
  Check,
  Coffee,
  Flame,
  LayoutGrid
} from 'lucide-react';
import { playNotificationChime } from '../utils/audio';

export default function CustomerView({ restaurantId = 'rest-dineflow-01', onSwitchToDashboard }) {
  const [activeCustomerTab, setActiveCustomerTab] = useState('queue'); // 'queue', 'tables', 'bill', 'menu'
  const [restaurant, setRestaurant] = useState(null);
  const [step, setStep] = useState(1); // 1: Welcome, 2: Details, 3.1: Table Ready, 3.2: Queue Joined, 4: Live Queue Tracker, 5: Table Ready Screen
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [partySize, setPartySize] = useState(2);
  const [seatingPref, setSeatingPref] = useState('Any Table');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Queue & Table State
  const [queueEntry, setQueueEntry] = useState(null);
  const [assignedTable, setAssignedTable] = useState(null);
  const [assignedSection, setAssignedSection] = useState('Main Hall');
  const [currentlyServing, setCurrentlyServing] = useState('A-020');
  const [peopleAhead, setPeopleAhead] = useState(0);
  const [estimatedWait, setEstimatedWait] = useState(15);
  const [simulatedNotification, setSimulatedNotification] = useState(null);

  // Rich Hospitality State: Tables, Menu, and Bill
  const [publicTables, setPublicTables] = useState({ total: 8, available: 3, occupied: 5, tables: [] });
  const [menuItems, setMenuItems] = useState([]);
  const [activeBill, setActiveBill] = useState(null);
  const [billSuccessToast, setBillSuccessToast] = useState('');

  // Customer ID stored from checkin
  const [customerId, setCustomerId] = useState(null);

  // Load restaurant details & public info
  useEffect(() => {
    fetchRestaurant();
    fetchPublicTables();
    fetchMenu();
    restoreCustomerSession();
  }, [restaurantId]);

  const fetchRestaurant = async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}`);
      if (res.ok) setRestaurant(await res.json());
    } catch (err) {}
  };

  const fetchPublicTables = async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/public-tables`);
      if (res.ok) setPublicTables(await res.json());
    } catch (err) {}
  };

  const fetchMenu = async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/menu`);
      if (res.ok) setMenuItems(await res.json());
    } catch (err) {}
  };

  const fetchActiveBill = async (cId) => {
    const idToUse = cId || customerId;
    if (!idToUse) return;
    try {
      const res = await fetch(`/api/customer/${idToUse}/active-bill`);
      if (res.ok) {
        const data = await res.json();
        setActiveBill(data);
      }
    } catch (err) {}
  };

  // Session persistence in LocalStorage
  const sessionKey = `dineflow_session_${restaurantId}`;

  const restoreCustomerSession = () => {
    try {
      const saved = localStorage.getItem(sessionKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.customerId) {
          setCustomerId(data.customerId);
          fetchActiveBill(data.customerId);
        }
        if (data.queueEntryId) {
          fetchLiveStatus(data.queueEntryId);
        }
      }
    } catch (err) {
      console.warn('Session restore error:', err);
    }
  };

  // Poll live queue status & SSE stream
  useEffect(() => {
    if (!queueEntry?.id && !customerId) return;

    if (queueEntry?.id) fetchLiveStatus(queueEntry.id);
    if (customerId) fetchActiveBill(customerId);

    const interval = setInterval(() => {
      if (queueEntry?.id) fetchLiveStatus(queueEntry.id);
      if (customerId) fetchActiveBill(customerId);
      fetchPublicTables();
    }, 4000);

    const eventSource = new EventSource(`/api/stream/${restaurantId}`);

    eventSource.addEventListener('notification', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.recipient === mobile || payload.tokenNumber === queueEntry?.token_number) {
          setSimulatedNotification(payload);
          playNotificationChime();
        }
      } catch (err) {}
    });

    eventSource.addEventListener('queue_update', (e) => {
      if (queueEntry?.id) fetchLiveStatus(queueEntry.id);
      fetchPublicTables();
    });

    eventSource.addEventListener('table_update', () => {
      fetchPublicTables();
    });

    eventSource.addEventListener('billing_updated', (e) => {
      if (customerId) {
        fetchActiveBill(customerId);
        setBillSuccessToast('Bill updated by restaurant staff!');
        setTimeout(() => setBillSuccessToast(''), 4000);
      }
    });

    return () => {
      clearInterval(interval);
      eventSource.close();
    };
  }, [queueEntry?.id, customerId, restaurantId, mobile]);

  const fetchLiveStatus = async (queueEntryId) => {
    try {
      const res = await fetch(`/api/queue/${queueEntryId}/status`);
      if (!res.ok) return;
      const data = await res.json();

      setCurrentlyServing(data.currentlyServing || 'A-020');
      setPeopleAhead(data.peopleAhead || 0);
      setEstimatedWait(data.estimatedWait || 5);

      if (data.status === 'READY') {
        if (step !== 5) {
          playNotificationChime();
        }
        setAssignedTable(data.assignedTable || 'T-05');
        setQueueEntry(data.queueEntry);
        setStep(5);
      } else if (data.status === 'WAITING') {
        setQueueEntry(data.queueEntry);
        if (step !== 4 && step !== 3 && step !== 3.2) {
          setStep(4);
        }
      } else if (data.status === 'SERVED') {
        setQueueEntry(data.queueEntry);
      }
    } catch (err) {}
  };

  // Handle Customer Check-in submission
  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!mobile.trim() || mobile.trim().length < 8) {
      setError('Please enter a valid mobile number');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/customer/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          name: name.trim(),
          mobile: mobile.trim(),
          partySize: parseInt(partySize, 10) || 2,
          seatingPreference: seatingPref,
          marketingConsent
        })
      });

      const data = await res.json();
      setIsLoading(false);

      if (!res.ok) {
        setError(data.error || 'Failed to check in. Please try again.');
        return;
      }

      const cId = data.customer?.id;
      setCustomerId(cId);

      if (data.state === 'TABLE_AVAILABLE' || data.state === 'TABLE_READY') {
        setAssignedTable(data.table?.table_number || data.queueEntry?.assigned_table_number || 'T-01');
        setAssignedSection(data.table?.section || 'Main Hall');
        setQueueEntry(data.queueEntry);
        setStep(3.1);

        localStorage.setItem(sessionKey, JSON.stringify({ 
          queueEntryId: data.queueEntry?.id, 
          customerId: cId,
          mobile 
        }));
        playNotificationChime();
        fetchActiveBill(cId);
      } else {
        setQueueEntry(data.queueEntry);
        setCurrentlyServing(data.currentlyServing);
        setPeopleAhead(data.peopleAhead);
        setEstimatedWait(data.estimatedWait);
        setStep(3.2);

        localStorage.setItem(sessionKey, JSON.stringify({ 
          queueEntryId: data.queueEntry?.id, 
          customerId: cId,
          mobile 
        }));
      }
    } catch (err) {
      setIsLoading(false);
      setError('Connection error. Please try again.');
    }
  };

  const handleStartOver = () => {
    localStorage.removeItem(sessionKey);
    setQueueEntry(null);
    setAssignedTable(null);
    setCustomerId(null);
    setActiveBill(null);
    setName('');
    setMobile('');
    setMarketingConsent(false);
    setSimulatedNotification(null);
    setStep(1);
    setActiveCustomerTab('queue');
  };

  const handleSimulatePayment = async () => {
    if (!activeBill?.visitId) return;
    try {
      const res = await fetch(`/api/visits/${activeBill.visitId}/pay`, { method: 'POST' });
      if (res.ok) {
        setBillSuccessToast('Payment settled! Thank you for dining with us.');
        fetchActiveBill();
      }
    } catch (e) {}
  };

  return (
    <div className="customer-page-wrapper">
      <style>{`
        .customer-page-wrapper {
          min-height: 100vh;
          background-color: #F8F9FA;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 16px;
        }

        .customer-phone-frame {
          width: 100%;
          max-width: 440px;
          min-height: 88vh;
          background-color: #FFFFFF;
          border-radius: 24px;
          border: 1px solid var(--border-subtle);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }

        .customer-top-bar {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-light);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background-color: #FFFFFF;
        }

        .brand-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
          font-size: 15px;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .brand-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: var(--brand-red);
        }

        /* Customer Navigation Pill Bar */
        .customer-subnav {
          display: flex;
          background-color: #F4F4F5;
          padding: 4px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .customer-subnav-btn {
          flex: 1;
          background: none;
          border: none;
          padding: 8px 6px;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-secondary);
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: all 0.15s ease;
        }

        .customer-subnav-btn.active {
          background-color: #FFFFFF;
          color: var(--brand-red);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        .customer-content-area {
          flex: 1;
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        @media (max-width: 640px) {
          .customer-page-wrapper {
            padding: 0 !important;
            background-color: #FFFFFF !important;
          }

          .customer-mode-header {
            display: none !important;
          }

          .customer-phone-frame {
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            max-width: 100% !important;
            min-height: calc(100vh - 46px) !important;
            width: 100% !important;
          }

          .customer-content-area {
            padding: 18px 16px !important;
          }

          .customer-top-bar {
            padding: 12px 16px !important;
          }

          .customer-subnav {
            padding: 4px !important;
          }

          .customer-subnav-btn {
            padding: 7px 4px !important;
            font-size: 11.5px !important;
            gap: 4px !important;
          }

          .hero-title {
            font-size: 22px !important;
          }

          .token-big {
            font-size: 38px !important;
          }

          .table-big-badge {
            font-size: 36px !important;
            padding: 12px 20px !important;
          }
        }

        .hero-title {
          font-size: 25px;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.25;
          margin-bottom: 8px;
          letter-spacing: -0.02em;
        }

        .hero-subtitle {
          font-size: 14.5px;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 24px;
        }

        .status-metric-card {
          background-color: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: 14px 12px;
          text-align: center;
        }

        .metric-value {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          font-family: var(--font-mono);
          margin-top: 2px;
        }

        .metric-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .token-display-box {
          background: linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%);
          border: 2px dashed var(--brand-red-border);
          border-radius: 18px;
          padding: 24px 16px;
          text-align: center;
          margin: 16px 0;
        }

        .token-big {
          font-size: 46px;
          font-weight: 800;
          color: var(--brand-red);
          font-family: var(--font-mono);
          line-height: 1.1;
          letter-spacing: 0.05em;
        }

        .table-big-badge {
          font-size: 48px;
          font-weight: 800;
          color: var(--text-primary);
          font-family: var(--font-mono);
          background-color: #ECFDF3;
          border: 2px solid #A6F4C5;
          border-radius: 18px;
          padding: 16px 28px;
          display: inline-block;
          margin: 12px 0;
        }

        .notification-toast {
          background-color: #18181B;
          color: #FFFFFF;
          border-radius: 14px;
          padding: 14px 16px;
          margin: 12px 16px 0 16px;
          font-size: 13px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
          animation: slideUp 0.3s ease-out;
        }

        .bill-receipt-card {
          background: #FFFFFF;
          border: 1px solid var(--border-subtle);
          border-radius: 18px;
          padding: 24px 20px;
          box-shadow: var(--shadow-sm);
          position: relative;
        }

        .bill-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
          color: var(--text-secondary);
        }

        .bill-row.total {
          border-top: 2px dashed var(--border-subtle);
          padding-top: 14px;
          margin-top: 8px;
          font-size: 18px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .hospitality-footer {
          padding: 14px 20px;
          border-top: 1px solid var(--border-light);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-muted);
          background-color: #FFFFFF;
        }
      `}</style>

      {/* Switcher header for Testing */}
      <div className="customer-mode-header" style={{ width: '100%', maxWidth: '440px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Smartphone size={15} /> Mobile Customer Experience
        </span>
        <button 
          onClick={onSwitchToDashboard}
          className="btn btn-subtle"
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          Staff Dashboard <ArrowRight size={13} />
        </button>
      </div>

      <div className="customer-phone-frame">
        {/* Top Header */}
        <div className="customer-top-bar">
          <div className="brand-pill">
            <span className="brand-dot"></span>
            DineFlow
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
            {restaurant?.name || 'Saffron & Sage'}
          </span>
        </div>

        {/* Customer View Navigation: Queue, Tables, Bill, Specials */}
        <nav className="customer-subnav">
          <button 
            className={`customer-subnav-btn ${activeCustomerTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveCustomerTab('queue')}
          >
            <Clock size={13} /> <span>Queue</span>
          </button>
          <button 
            className={`customer-subnav-btn ${activeCustomerTab === 'tables' ? 'active' : ''}`}
            onClick={() => setActiveCustomerTab('tables')}
          >
            <LayoutGrid size={13} /> <span>Tables</span>
            <span style={{ 
              fontSize: '10px', 
              background: activeCustomerTab === 'tables' ? 'var(--brand-red)' : '#E4E4E7', 
              color: activeCustomerTab === 'tables' ? '#fff' : 'var(--text-secondary)',
              padding: '1px 5px',
              borderRadius: '9999px',
              fontWeight: 700
            }}>
              {publicTables.available}
            </span>
          </button>
          <button 
            className={`customer-subnav-btn ${activeCustomerTab === 'bill' ? 'active' : ''}`}
            onClick={() => setActiveCustomerTab('bill')}
          >
            <Receipt size={13} /> <span>Bill</span>
            {activeBill?.hasActiveBill && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#D92D20' }}></span>}
          </button>
          <button 
            className={`customer-subnav-btn ${activeCustomerTab === 'menu' ? 'active' : ''}`}
            onClick={() => setActiveCustomerTab('menu')}
          >
            <Flame size={13} /> <span>Specials</span>
          </button>
        </nav>

        {/* Simulated Instant Notification Banner */}
        {simulatedNotification && (
          <div className="notification-toast">
            <Bell size={18} style={{ color: '#F87171', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>WhatsApp / SMS Notification</span>
                <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '4px' }}>Just now</span>
              </div>
              <div style={{ color: '#E4E4E7', lineHeight: '1.4' }}>
                {simulatedNotification.message}
              </div>
            </div>
          </div>
        )}

        {billSuccessToast && (
          <div style={{ background: '#ECFDF3', color: '#027A48', border: '1px solid #A6F4C5', padding: '10px 16px', margin: '10px 16px 0 16px', borderRadius: '12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} /> {billSuccessToast}
          </div>
        )}

        {/* ================= TAB 1: PRIMARY QUEUE FLOW ================= */}
        {activeCustomerTab === 'queue' && (
          <>
            {/* SCREEN 1: WELCOME */}
            {step === 1 && (
              <div className="customer-content-area" style={{ textAlign: 'center', justifyContent: 'center' }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '20px', 
                  backgroundColor: 'var(--brand-red-subtle)', 
                  color: 'var(--brand-red)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px auto',
                  fontSize: '32px'
                }}>
                  {restaurant?.logo || '🍽️'}
                </div>

                <h1 className="hero-title">
                  Welcome to<br />
                  {restaurant?.name || 'Saffron & Sage'}
                </h1>
                
                <p className="hero-subtitle">
                  Let's find a table for you.
                </p>

                {/* Live Seating summary pill */}
                <div style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  background: '#FAFAFA', 
                  border: '1px solid var(--border-subtle)', 
                  padding: '8px 16px', 
                  borderRadius: '9999px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  margin: '0 auto 24px auto'
                }}>
                  <span className="badge-dot" style={{ backgroundColor: publicTables.available > 0 ? '#027A48' : '#D92D20' }}></span>
                  <span>{publicTables.available} tables currently ready</span>
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                  <button 
                    onClick={() => setStep(2)}
                    className="btn btn-primary btn-block btn-lg"
                  >
                    Check Table Availability
                  </button>
                  
                  <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    <Clock size={14} /> Quick & contactless check-in
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN 2: CUSTOMER DETAILS */}
            {step === 2 && (
              <div className="customer-content-area">
                <button 
                  onClick={() => setStep(1)} 
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  ← Back
                </button>

                <h1 className="hero-title" style={{ fontSize: '24px' }}>
                  Your Details
                </h1>
                <p className="hero-subtitle" style={{ marginBottom: '20px' }}>
                  We'll notify you as soon as your table is ready.
                </p>

                {error && (
                  <div style={{ 
                    backgroundColor: 'var(--brand-red-subtle)', 
                    color: 'var(--brand-red)', 
                    padding: '12px 14px', 
                    borderRadius: 'var(--radius-md)', 
                    fontSize: '13.5px',
                    marginBottom: '20px',
                    border: '1px solid var(--brand-red-border)'
                  }}>
                    {error}
                  </div>
                )}

                <form onSubmit={handleCheckIn}>
                  <div className="form-group">
                    <label className="form-label">Your Name</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="e.g. Rahul Sharma" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Mobile Number</label>
                    <input 
                      type="tel" 
                      className="form-input" 
                      placeholder="e.g. 98201 12345" 
                      value={mobile} 
                      onChange={(e) => setMobile(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Number of Guests</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                      {[1, 2, 3, 4, 5, 6].map(num => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setPartySize(num)}
                          style={{
                            padding: '10px 0',
                            textAlign: 'center',
                            borderRadius: '10px',
                            border: partySize === num ? '2px solid var(--brand-red)' : '1px solid var(--border-subtle)',
                            background: partySize === num ? 'var(--brand-red-subtle)' : '#FFFFFF',
                            color: partySize === num ? 'var(--brand-red)' : 'var(--text-primary)',
                            fontWeight: 700,
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          {num === 6 ? '6+' : num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Seating Preference</label>
                    <select 
                      className="form-input"
                      value={seatingPref}
                      onChange={(e) => setSeatingPref(e.target.value)}
                    >
                      <option value="Any Table">Any Available Table (Fastest)</option>
                      <option value="Main Hall">Main Dining Hall</option>
                      <option value="Outdoor Terrace">Outdoor Garden Terrace</option>
                      <option value="Window Booth">Window Booth</option>
                    </select>
                  </div>

                  <div style={{ marginTop: '20px', marginBottom: '28px' }}>
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={marketingConsent} 
                        onChange={(e) => setMarketingConsent(e.target.checked)} 
                      />
                      <span>
                        I agree to receive offers and updates from this restaurant via WhatsApp/SMS.
                      </span>
                    </label>
                  </div>

                  <button 
                    type="submit" 
                    disabled={isLoading}
                    className="btn btn-primary btn-block btn-lg"
                  >
                    {isLoading ? 'Checking Tables...' : 'Continue'}
                  </button>
                </form>
              </div>
            )}

            {/* SCREEN 3A: TABLE AVAILABLE IMMEDIATELY */}
            {step === 3.1 && (
              <div className="customer-content-area" style={{ textAlign: 'center', justifyContent: 'center' }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '50%', 
                  backgroundColor: '#ECFDF3', 
                  color: '#027A48',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto'
                }}>
                  <CheckCircle2 size={36} />
                </div>

                <h1 className="hero-title" style={{ color: '#027A48' }}>
                  Your Table is Ready
                </h1>

                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Assigned Table
                </p>

                <div>
                  <div className="table-big-badge">
                    {assignedTable || 'T-05'}
                  </div>
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  <MapPin size={14} /> Section: <strong>{assignedSection}</strong>
                </div>

                <p className="hero-subtitle" style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '32px' }}>
                  Please proceed to your table.
                </p>

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    onClick={() => setStep(5)}
                    className="btn btn-primary btn-block btn-lg"
                  >
                    View Table Details
                  </button>

                  <button 
                    onClick={() => setActiveCustomerTab('bill')}
                    className="btn btn-secondary btn-block"
                  >
                    <Receipt size={15} /> Check Table & Bill
                  </button>
                </div>
              </div>
            )}

            {/* SCREEN 3B: TABLE NOT AVAILABLE (QUEUED) */}
            {step === 3.2 && (
              <div className="customer-content-area" style={{ textAlign: 'center', justifyContent: 'center' }}>
                <div style={{ 
                  width: '56px', 
                  height: '56px', 
                  borderRadius: '50%', 
                  backgroundColor: 'var(--brand-red-subtle)', 
                  color: 'var(--brand-red)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto'
                }}>
                  <Users size={28} />
                </div>

                <h1 className="hero-title" style={{ fontSize: '24px' }}>
                  We're currently full
                </h1>

                <p className="hero-subtitle" style={{ marginBottom: '16px' }}>
                  But don't worry — we'll keep your place in line.
                </p>

                <div className="token-display-box">
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Your Token
                  </span>
                  <div className="token-big">
                    {queueEntry?.token_number || 'A-025'}
                  </div>
                </div>

                {/* Metrics summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '24px' }}>
                  <div className="status-metric-card">
                    <div className="metric-label">Serving</div>
                    <div className="metric-value">{currentlyServing}</div>
                  </div>
                  <div className="status-metric-card">
                    <div className="metric-label">Ahead</div>
                    <div className="metric-value">{peopleAhead}</div>
                  </div>
                  <div className="status-metric-card">
                    <div className="metric-label">Est. Wait</div>
                    <div className="metric-value">{estimatedWait}m</div>
                  </div>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    onClick={() => setStep(4)}
                    className="btn btn-primary btn-block btn-lg"
                  >
                    Track My Queue
                  </button>

                  <button 
                    onClick={() => setActiveCustomerTab('menu')}
                    className="btn btn-secondary btn-block"
                  >
                    <Flame size={15} /> Browse Specials While Waiting
                  </button>
                </div>
              </div>
            )}

            {/* SCREEN 4: CUSTOMER QUEUE SCREEN (TRACKING) */}
            {step === 4 && (
              <div className="customer-content-area" style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Your Token
                </span>
                
                <div style={{ margin: '6px 0 16px 0' }}>
                  <span style={{ 
                    fontSize: '52px', 
                    fontWeight: 800, 
                    color: 'var(--text-primary)', 
                    fontFamily: 'var(--font-mono)' 
                  }}>
                    {queueEntry?.token_number || 'A-025'}
                  </span>
                </div>

                {/* Status card */}
                <div className="card" style={{ padding: '18px 14px', marginBottom: '20px', backgroundColor: '#FAFAFA' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '14px', marginBottom: '14px' }}>
                    <div>
                      <div className="metric-label">Serving</div>
                      <div className="metric-value" style={{ fontSize: '19px' }}>{currentlyServing}</div>
                    </div>
                    <div>
                      <div className="metric-label">Ahead</div>
                      <div className="metric-value" style={{ fontSize: '19px' }}>{peopleAhead}</div>
                    </div>
                    <div>
                      <div className="metric-label">Est. Wait</div>
                      <div className="metric-value" style={{ fontSize: '19px' }}>{estimatedWait}m</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="badge badge-waiting pulse-red">
                      <span className="badge-dot"></span>
                      WAITING
                    </span>
                  </div>
                </div>

                {/* Proactive Automated "You are Next" Alert */}
                {peopleAhead === 0 ? (
                  <div style={{ 
                    backgroundColor: '#FEF08A', 
                    border: '2px solid #EAB308', 
                    borderRadius: 'var(--radius-md)', 
                    padding: '14px 16px', 
                    fontSize: '13.5px', 
                    color: '#713F12',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'left',
                    marginBottom: '16px',
                    animation: 'subtlePulse 2s infinite ease-in-out'
                  }}>
                    <Bell size={22} style={{ color: '#CA8A04', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        You Are Next in Line!
                      </div>
                      <div style={{ fontSize: '12.5px', marginTop: '2px', color: '#854D0E' }}>
                        Please proceed to the reception desk. Your table is being prepared right now!
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    backgroundColor: '#FFFFFF', 
                    border: '1px solid var(--border-subtle)', 
                    borderRadius: 'var(--radius-md)', 
                    padding: '12px 14px', 
                    fontSize: '13px', 
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'left',
                    marginBottom: '14px'
                  }}>
                    <Bell size={18} style={{ color: 'var(--brand-red)', flexShrink: 0 }} />
                    <span>Please stay close to our dining room reception. We'll seat you shortly.</span>
                  </div>
                )}

                {/* Customer Retention & Loyalty Card */}
                <div style={{ 
                  background: 'linear-gradient(135deg, #FEF3F2 0%, #FFF1F2 100%)', 
                  border: '1px solid var(--brand-red-border)', 
                  borderRadius: 'var(--radius-md)', 
                  padding: '12px 14px', 
                  fontSize: '12.5px', 
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <Sparkles size={18} style={{ color: 'var(--brand-red)', flexShrink: 0 }} />
                  <div>
                    <strong>Guest Loyalty Reward:</strong> Today's visit earns you a <strong>10% loyalty credit</strong> for your next dining experience at {restaurant?.name || 'this restaurant'}!
                  </div>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    onClick={() => setActiveCustomerTab('tables')}
                    className="btn btn-secondary btn-block"
                  >
                    <LayoutGrid size={15} /> View Restaurant Tables
                  </button>

                  <button 
                    onClick={() => fetchLiveStatus(queueEntry?.id)}
                    className="btn btn-subtle btn-block"
                    style={{ fontSize: '13px' }}
                  >
                    <RefreshCw size={14} /> Refresh Status
                  </button>

                  <button 
                    onClick={handleStartOver}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', marginTop: '4px' }}
                  >
                    Leave queue & start over
                  </button>
                </div>
              </div>
            )}

            {/* SCREEN 5: TABLE READY SCREEN */}
            {step === 5 && (
              <div className="customer-content-area" style={{ textAlign: 'center' }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '50%', 
                  backgroundColor: '#ECFDF3', 
                  color: '#027A48',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px auto',
                  boxShadow: '0 0 0 8px rgba(18, 183, 106, 0.12)'
                }}>
                  <CheckCircle2 size={38} />
                </div>

                <h1 className="hero-title" style={{ fontSize: '26px', color: '#027A48', marginBottom: '2px' }}>
                  Your Table is Ready
                </h1>

                <div style={{ margin: '12px 0 16px 0' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Table Number
                  </div>
                  <div className="table-big-badge" style={{ margin: '6px 0 10px 0' }}>
                    {assignedTable || queueEntry?.assigned_table_number || 'T-05'}
                  </div>
                </div>

                <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
                  Please proceed to the restaurant.
                </p>

                {/* Token & Status card */}
                <div className="card" style={{ padding: '14px 16px', marginBottom: '20px', backgroundColor: '#FAFAFA' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>TOKEN</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                        {queueEntry?.token_number || 'A-025'}
                      </div>
                    </div>

                    <div>
                      <span className="badge badge-ready">
                        <span className="badge-dot"></span>
                        READY
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    onClick={() => setActiveCustomerTab('bill')}
                    className="btn btn-primary btn-block btn-lg"
                  >
                    <Receipt size={16} /> View Table Bill & Receipt
                  </button>

                  <button 
                    onClick={handleStartOver}
                    className="btn btn-secondary btn-block"
                  >
                    Done / Check-in another guest
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ================= TAB 2: LIVE RESTAURANT TABLES ================= */}
        {activeCustomerTab === 'tables' && (
          <div className="customer-content-area">
            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>
              Restaurant Table Overview
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', marginBottom: '16px' }}>
              Live availability across all dining areas
            </p>

            {/* Availability pills */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '20px' }}>
              <div style={{ background: '#ECFDF3', border: '1px solid #A6F4C5', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#027A48' }}>{publicTables.available}</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#027A48' }}>Available</div>
              </div>
              <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#B42318' }}>{publicTables.occupied}</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#B42318' }}>Occupied</div>
              </div>
              <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', padding: '10px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#B54708' }}>{publicTables.preparing}</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#B54708' }}>Preparing</div>
              </div>
            </div>

            {/* Tables Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {publicTables.tables?.map(t => {
                const isMyTable = assignedTable === t.table_number;
                return (
                  <div 
                    key={t.id} 
                    className="card"
                    style={{ 
                      padding: '14px', 
                      textAlign: 'center',
                      border: isMyTable ? '2px solid #027A48' : '1px solid var(--border-subtle)',
                      backgroundColor: isMyTable ? '#F6FEF9' : '#FFFFFF'
                    }}
                  >
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {t.section} • {t.capacity} Seats
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                      {t.table_number}
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      {isMyTable ? (
                        <span className="badge badge-available" style={{ fontSize: '10px' }}>YOUR TABLE</span>
                      ) : t.status === 'AVAILABLE' ? (
                        <span className="badge badge-available" style={{ fontSize: '10px' }}>AVAILABLE</span>
                      ) : (
                        <span className="badge badge-occupied" style={{ fontSize: '10px' }}>{t.status}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button 
              onClick={() => setActiveCustomerTab('queue')}
              className="btn btn-secondary btn-block"
              style={{ marginTop: 'auto' }}
            >
              Back to Queue Tracker
            </button>
          </div>
        )}

        {/* ================= TAB 3: DIGITAL BILL & RECEIPT ================= */}
        {activeCustomerTab === 'bill' && (
          <div className="customer-content-area">
            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>
              Table & Digital Bill
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', marginBottom: '18px' }}>
              Instant digital billing breakdown for your visit
            </p>

            {activeBill?.hasActiveBill ? (
              <div className="bill-receipt-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand-red)', letterSpacing: '0.05em' }}>DIGITAL RECEIPT</span>
                    <h3 style={{ fontSize: '18px', fontWeight: 800 }}>{activeBill.restaurantName}</h3>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="badge badge-assigned" style={{ fontSize: '11px' }}>
                      Table {activeBill.tableNumber}
                    </span>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {activeBill.section}
                    </div>
                  </div>
                </div>

                <div className="bill-row">
                  <span>Guest Name</span>
                  <strong>{activeBill.customer?.name}</strong>
                </div>
                <div className="bill-row">
                  <span>Date & Time</span>
                  <span>{new Date(activeBill.visitDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="bill-row">
                  <span>Food & Beverage Subtotal</span>
                  <span>₹{activeBill.subtotal}</span>
                </div>
                <div className="bill-row">
                  <span>Restaurant GST (5%)</span>
                  <span>₹{activeBill.gst}</span>
                </div>

                <div className="bill-row total">
                  <span>Total Amount</span>
                  <span style={{ color: 'var(--brand-red)' }}>₹{activeBill.totalAmount}</span>
                </div>

                {/* Status indicator */}
                <div style={{ marginTop: '18px', padding: '12px', borderRadius: '12px', background: activeBill.status === 'PAID' ? '#ECFDF3' : '#FFFAEB', textAlign: 'center' }}>
                  {activeBill.status === 'PAID' ? (
                    <div style={{ color: '#027A48', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <CheckCircle2 size={16} /> Bill Settled & Paid
                    </div>
                  ) : (
                    <div style={{ color: '#B54708', fontWeight: 600, fontSize: '13px' }}>
                      Payment Pending • Pay at counter or via UPI
                    </div>
                  )}
                </div>

                {activeBill.status !== 'PAID' && (
                  <button 
                    onClick={handleSimulatePayment}
                    className="btn btn-primary btn-block"
                    style={{ marginTop: '16px' }}
                  >
                    <CreditCard size={15} /> Pay / Settle Bill (Demo)
                  </button>
                )}
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: '36px 18px' }}>
                <Receipt size={36} style={{ margin: '0 auto 12px auto', color: 'var(--text-muted)' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>No Active Bill Yet</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {activeBill?.table ? (
                    <>You are assigned to <strong>Table {activeBill.table.table_number}</strong>. Once you are served, restaurant staff will generate your bill and it will appear here instantly.</>
                  ) : (
                    <>Check in or get assigned a table to view your dining bill here.</>
                  )}
                </p>

                <button 
                  onClick={() => fetchActiveBill()}
                  className="btn btn-secondary"
                  style={{ marginTop: '18px', padding: '8px 16px', fontSize: '13px' }}
                >
                  <RefreshCw size={14} /> Refresh Bill Status
                </button>
              </div>
            )}

            <button 
              onClick={() => setActiveCustomerTab('queue')}
              className="btn btn-subtle btn-block"
              style={{ marginTop: 'auto' }}
            >
              Back to Queue Tracker
            </button>
          </div>
        )}

        {/* ================= TAB 4: WHILE YOU WAIT (SPECIALS) ================= */}
        {activeCustomerTab === 'menu' && (
          <div className="customer-content-area">
            <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>
              Chef's Specials
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', marginBottom: '18px' }}>
              Browse our signature dishes while waiting for your table
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {menuItems.map(item => (
                <div key={item.id} className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{item.name}</div>
                    <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--brand-red)', fontSize: '15px' }}>
                      ₹{item.price}
                    </span>
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '8px' }}>
                    {item.description}
                  </p>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {item.badge && (
                      <span className="badge badge-waiting" style={{ fontSize: '10px', padding: '2px 8px' }}>
                        {item.badge}
                      </span>
                    )}
                    <span className="badge badge-served" style={{ fontSize: '10px', padding: '2px 8px' }}>
                      {item.category}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => setActiveCustomerTab('queue')}
              className="btn btn-secondary btn-block"
              style={{ marginTop: '20px' }}
            >
              Back to Queue Tracker
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="hospitality-footer">
          <span>DineFlow Hospitality</span>
          <span>Scan. Wait. Get Your Table.</span>
        </div>
      </div>
    </div>
  );
}
