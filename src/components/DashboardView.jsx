import React, { useState, useEffect } from 'react';
import {
  Users,
  Bell,
  LayoutGrid,
  ListOrdered,
  UserCheck,
  QrCode,
  Sliders,
  PhoneCall,
  Clock,
  Phone,
  DollarSign,
  Plus,
  CheckCircle,
  AlertCircle,
  MoreVertical,
  Check,
  RefreshCw,
  ExternalLink,
  Download,
  Printer,
  ChevronDown,
  Receipt,
  Monitor,
  Zap,
  Search,
  Megaphone,
  MessageSquare,
  Send,
  Mail,
  X,
  Volume2
} from 'lucide-react';
import { playNotificationChime } from '../utils/audio';

export default function DashboardView({ restaurantId = 'rest-dineflow-01', onOpenCustomerView }) {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'queue', 'tables', 'customers', 'qr', 'led', 'settings'
  const [restaurant, setRestaurant] = useState(null);
  const [stats, setStats] = useState({ waiting: 0, availableTables: 0, occupied: 0, servedToday: 0 });
  const [queue, setQueue] = useState([]);
  const [tables, setTables] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [qrInfo, setQrInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Call Modal State
  const [callModalData, setCallModalData] = useState(null); // { queueEntry, selectedTableId }
  // Billing Modal State
  const [billingModalData, setBillingModalData] = useState(null); // { customer, billAmount, tableId }
  // Customer Profile Modal State
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  // Add Table Modal State
  const [isAddTableOpen, setIsAddTableOpen] = useState(false);
  const [newTableNum, setNewTableNum] = useState('');
  const [newTableCap, setNewTableCap] = useState(4);
  const [customerSearch, setCustomerSearch] = useState('');

  // Offers & Marketing State
  const [offerTitle, setOfferTitle] = useState('Weekend Dining: 20% Off');
  const [offerMessage, setOfferMessage] = useState('We would love to see you this weekend! Enjoy 20% off your food bill on tables reserved before 8 PM.');
  const [offerChannel, setOfferChannel] = useState('WHATSAPP');
  const [offerRecipientMode, setOfferRecipientMode] = useState('OPTED_IN'); // 'OPTED_IN' or 'CUSTOM'
  const [customOfferMobile, setCustomOfferMobile] = useState('');
  const [campaignLogs, setCampaignLogs] = useState([]);
  const [isSendingOffer, setIsSendingOffer] = useState(false);

  // Notification Toast in dashboard
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    loadAllData();

    // SSE connection for live updates
    const eventSource = new EventSource(`/api/stream/${restaurantId}`);

    eventSource.addEventListener('queue_update', (e) => {
      loadStats();
      loadQueue();
      loadTables();
      loadCustomers();
    });

    eventSource.addEventListener('table_update', (e) => {
      loadTables();
      loadStats();
    });

    eventSource.addEventListener('notification', (e) => {
      try {
        const payload = JSON.parse(e.data);
        showToast(`Notified ${payload.customerName} (${payload.tokenNumber}) → Table ${payload.tableNumber}`);
      } catch (err) {}
    });

    const interval = setInterval(() => {
      loadStats();
      loadQueue();
    }, 6000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [restaurantId]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadAllData = async () => {
    setIsLoading(true);
    await Promise.all([
      loadRestaurant(),
      loadStats(),
      loadQueue(),
      loadTables(),
      loadCustomers(),
      loadQr()
    ]);
    setIsLoading(false);
  };

  const loadRestaurant = async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}`);
      if (res.ok) setRestaurant(await res.json());
    } catch (e) {}
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/dashboard-stats`);
      if (res.ok) setStats(await res.json());
    } catch (e) {}
  };

  const loadQueue = async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/queue`);
      if (res.ok) setQueue(await res.json());
    } catch (e) {}
  };

  const loadTables = async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/tables`);
      if (res.ok) setTables(await res.json());
    } catch (e) {}
  };

  const loadCustomers = async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/customers`);
      if (res.ok) setCustomers(await res.json());
    } catch (e) {}
  };

  const loadQr = async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/qr`);
      if (res.ok) setQrInfo(await res.json());
    } catch (e) {}
  };

  // Staff Table Status Change
  const updateTableStatus = async (tableId, newStatus) => {
    try {
      const res = await fetch(`/api/tables/${tableId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        showToast(`Table status updated to ${newStatus}`);
        loadTables();
        loadStats();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Add new table
  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!newTableNum.trim()) return;

    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: newTableNum.trim(), capacity: newTableCap })
      });
      if (res.ok) {
        setNewTableNum('');
        setIsAddTableOpen(false);
        showToast('New table created');
        loadTables();
        loadStats();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Initiate Call modal
  const openCallModal = (queueEntry) => {
    // Pick the first available table as default
    const available = tables.find(t => t.status === 'AVAILABLE');
    setCallModalData({
      queueEntry,
      selectedTableId: available ? available.id : (tables[0] ? tables[0].id : '')
    });
  };

  // Confirm Call and Table Assignment
  const handleConfirmCall = async () => {
    if (!callModalData || !callModalData.selectedTableId) return;

    const { queueEntry, selectedTableId } = callModalData;

    try {
      const res = await fetch(`/api/queue/${queueEntry.id}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId: selectedTableId })
      });

      if (res.ok) {
        const selectedTable = tables.find(t => t.id === selectedTableId);
        showToast(`Assigned ${queueEntry.token_number} to ${selectedTable?.table_number || 'Table'} & Notified Customer`);
        playNotificationChime();
        setCallModalData(null);
        loadQueue();
        loadTables();
        loadStats();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to call customer');
      }
    } catch (err) {
      console.error('Call customer failed:', err);
    }
  };

  // 1-Click Auto Assign Next Customer to Available Table
  const handleAutoAssignNext = async () => {
    if (waitingQueue.length === 0) {
      showToast('No customers currently waiting in line');
      return;
    }
    const available = tables.find(t => t.status === 'AVAILABLE');
    if (!available) {
      showToast('No tables currently available to assign');
      return;
    }

    const nextCustomer = waitingQueue[0];
    try {
      const res = await fetch(`/api/queue/${nextCustomer.id}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId: available.id })
      });
      if (res.ok) {
        showToast(`⚡ Auto-assigned ${nextCustomer.token_number} (${nextCustomer.customer_name}) to Table ${available.table_number}!`);
        playNotificationChime();
        loadQueue();
        loadTables();
        loadStats();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Recall customer
  const handleRecall = async (queueEntryId) => {
    try {
      const res = await fetch(`/api/queue/${queueEntryId}/recall`, { method: 'POST' });
      if (res.ok) {
        showToast('Notification re-sent to customer');
      }
    } catch (err) {}
  };

  // Mark Served
  const handleMarkServed = async (queueEntry) => {
    try {
      const res = await fetch(`/api/queue/${queueEntry.id}/served`, { method: 'POST' });
      if (res.ok) {
        showToast(`Customer ${queueEntry.token_number} marked as served`);
        loadQueue();
        loadTables();
        loadStats();
        // Prompt for billing directly
        setBillingModalData({
          customerId: queueEntry.customer_id,
          customerName: queueEntry.customer_name,
          billAmount: '',
          tableId: queueEntry.assigned_table_id
        });
      }
    } catch (err) {}
  };

  // Skip
  const handleSkip = async (queueEntryId) => {
    if (!confirm('Are you sure you want to skip this customer?')) return;
    try {
      await fetch(`/api/queue/${queueEntryId}/skip`, { method: 'POST' });
      loadQueue();
      loadTables();
      loadStats();
      showToast('Customer marked as skipped');
    } catch (err) {}
  };

  // Cancel
  const handleCancel = async (queueEntryId) => {
    if (!confirm('Are you sure you want to remove this entry from queue?')) return;
    try {
      await fetch(`/api/queue/${queueEntryId}/cancel`, { method: 'POST' });
      loadQueue();
      loadTables();
      loadStats();
      showToast('Queue entry cancelled');
    } catch (err) {}
  };

  // Save manual bill amount
  const handleSaveBill = async (e) => {
    e.preventDefault();
    if (!billingModalData || !billingModalData.billAmount) return;

    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: billingModalData.customerId,
          restaurantId,
          billAmount: parseFloat(billingModalData.billAmount),
          tableId: billingModalData.tableId
        })
      });

      if (res.ok) {
        showToast(`Bill of ₹${billingModalData.billAmount} saved successfully`);
        setBillingModalData(null);
        loadCustomers();
        loadTables();
      }
    } catch (err) {
      console.error('Failed to save bill:', err);
    }
  };

  // Dispatch Promotional Offer Campaign
  const handleDispatchOffer = async (e) => {
    e.preventDefault();
    if (!offerTitle.trim() || !offerMessage.trim()) {
      showToast('Please enter offer title and message');
      return;
    }

    setIsSendingOffer(true);
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/send-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: offerTitle,
          message: offerMessage,
          channel: offerChannel,
          selectedMobile: offerRecipientMode === 'CUSTOM' ? customOfferMobile.trim() : null
        })
      });

      const data = await res.json();
      setIsSendingOffer(false);

      if (res.ok) {
        showToast(data.message || 'Offer dispatched!');
        playNotificationChime();
        setCampaignLogs(prev => [...(data.logs || []), ...prev]);
      } else {
        alert(data.error || 'Failed to send campaign');
      }
    } catch (err) {
      setIsSendingOffer(false);
      console.error('Failed to dispatch offer:', err);
    }
  };

  // Open customer profile modal
  const viewCustomerProfile = async (customerId) => {
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      if (res.ok) {
        setSelectedCustomer(await res.json());
      }
    } catch (err) {}
  };

  const waitingQueue = queue.filter(q => q.status === 'WAITING');
  const calledQueue = queue.filter(q => q.status === 'READY');

  return (
    <div className="dashboard-layout">
      <style>{`
        .dashboard-layout {
          min-height: 100vh;
          background-color: #FAFAFA;
          display: flex;
          flex-direction: column;
        }

        .dashboard-nav {
          background-color: #FFFFFF;
          border-bottom: 1px solid var(--border-subtle);
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 68px;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .dashboard-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 800;
          font-size: 18px;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        .dashboard-tabs {
          display: flex;
          gap: 6px;
          height: 100%;
        }

        .tab-btn {
          background: none;
          border: none;
          padding: 0 16px;
          height: 100%;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          position: relative;
          transition: color 0.15s ease;
        }

        .tab-btn:hover {
          color: var(--text-primary);
        }

        .tab-btn.active {
          color: var(--brand-red);
        }

        .tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background-color: var(--brand-red);
          border-radius: 3px 3px 0 0;
        }

        .dashboard-main {
          flex: 1;
          max-width: 1240px;
          width: 100%;
          margin: 0 auto;
          padding: 32px 24px 64px 24px;
        }

        /* Top Summary Cards */
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        @media (max-width: 900px) {
          .summary-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .dashboard-nav {
            padding: 0 16px;
          }
        }

        @media (max-width: 600px) {
          .summary-grid {
            grid-template-columns: 1fr;
          }
        }

        .summary-card {
          background-color: #FFFFFF;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 22px 24px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          box-shadow: var(--shadow-xs);
        }

        .summary-label {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .summary-number {
          font-size: 36px;
          font-weight: 800;
          color: var(--text-primary);
          font-family: var(--font-mono);
          letter-spacing: -0.03em;
        }

        /* Table visual cards */
        .tables-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 20px;
        }

        .table-card {
          background-color: #FFFFFF;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: 20px;
          text-align: center;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .table-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-sm);
        }

        .table-name {
          font-size: 26px;
          font-weight: 800;
          font-family: var(--font-mono);
          margin-bottom: 8px;
        }

        .toast-banner {
          position: fixed;
          bottom: 24px;
          right: 24px;
          background-color: #18181B;
          color: #FFFFFF;
          padding: 14px 20px;
          border-radius: var(--radius-md);
          font-size: 14px;
          font-weight: 500;
          box-shadow: var(--shadow-lg);
          display: flex;
          align-items: center;
          gap: 10px;
          z-index: 2000;
          animation: slideUp 0.2s ease-out;
        }
      `}</style>

      {/* Top Navigation */}
      <header className="dashboard-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
          <div className="dashboard-brand">
            <span style={{ 
              width: '32px', 
              height: '32px', 
              borderRadius: '8px', 
              backgroundColor: 'var(--brand-red)', 
              color: '#FFFFFF', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '16px'
            }}>
              D
            </span>
            <span>DineFlow</span>
          </div>

          <nav className="dashboard-tabs">
            <button 
              className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </button>
            <button 
              className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
              onClick={() => setActiveTab('queue')}
            >
              Queue {waitingQueue.length > 0 && <span className="badge badge-waiting" style={{ padding: '2px 7px', fontSize: '11px' }}>{waitingQueue.length}</span>}
            </button>
            <button 
              className={`tab-btn ${activeTab === 'tables' ? 'active' : ''}`}
              onClick={() => setActiveTab('tables')}
            >
              Tables
            </button>
            <button 
              className={`tab-btn ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => setActiveTab('customers')}
            >
              Customers
            </button>
            <button 
              className={`tab-btn ${activeTab === 'offers' ? 'active' : ''}`}
              onClick={() => setActiveTab('offers')}
            >
              Offers & WhatsApp
            </button>
            <button 
              className={`tab-btn ${activeTab === 'qr' ? 'active' : ''}`}
              onClick={() => setActiveTab('qr')}
            >
              QR Code
            </button>
            <button 
              className={`tab-btn ${activeTab === 'led' ? 'active' : ''}`}
              onClick={() => setActiveTab('led')}
            >
              LED Display
            </button>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Quick test: Open customer QR view */}
          <button 
            onClick={onOpenCustomerView}
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '13.5px' }}
            title="Open customer-facing QR interface"
          >
            <QrCode size={15} /> Open Customer View
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '14px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{restaurant?.name || 'Restaurant Staff'}</span>
            <span className="badge badge-available" style={{ fontSize: '11px' }}>Live</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="dashboard-main">

        {/* ================= TAB 1: DASHBOARD HOME ================= */}
        {activeTab === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  Dashboard Overview
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Live waiting queue and table occupancy
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {waitingQueue.length > 0 && stats.availableTables > 0 && (
                  <button 
                    onClick={handleAutoAssignNext}
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                    title="Automatically assigns next customer to available table & sends WhatsApp/SMS notification"
                  >
                    <Zap size={14} /> Auto-Seat Next ({waitingQueue[0]?.token_number})
                  </button>
                )}
                <button 
                  onClick={loadAllData} 
                  className="btn btn-secondary" 
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            </div>

            {/* Top Summary Cards */}
            <div className="summary-grid">
              <div className="summary-card">
                <span className="summary-label">Waiting</span>
                <span className="summary-number" style={{ color: 'var(--brand-red)' }}>{stats.waiting}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Available Tables</span>
                <span className="summary-number" style={{ color: '#027A48' }}>{stats.availableTables}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Occupied</span>
                <span className="summary-number">{stats.occupied}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Served Today</span>
                <span className="summary-number">{stats.servedToday}</span>
              </div>
            </div>

            {/* Currently Called / Ready Customers (Awaiting Seating) */}
            {calledQueue.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bell size={18} style={{ color: 'var(--brand-red)' }} />
                  Called & Ready (Awaiting Arrival)
                </h2>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                  {calledQueue.map(item => (
                    <div key={item.id} className="card" style={{ borderLeft: '4px solid #175CD3' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '24px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                            {item.token_number}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: '15px' }}>{item.customer_name}</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{item.customer_mobile}</div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span className="badge badge-ready" style={{ marginBottom: '6px' }}>
                            READY
                          </span>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#175CD3' }}>
                            Table: {item.assigned_table_number || 'T-05'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                        <button 
                          onClick={() => handleMarkServed(item)} 
                          className="btn btn-primary"
                          style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
                        >
                          <Check size={14} /> Mark Seated / Served
                        </button>
                        <button 
                          onClick={() => handleRecall(item.id)}
                          className="btn btn-secondary"
                          style={{ padding: '8px 12px', fontSize: '13px' }}
                          title="Re-send notification"
                        >
                          Recall
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current Queue Table */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700 }}>
                  Current Waiting Queue
                </h2>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {waitingQueue.length} customers in line
                </span>
              </div>

              {waitingQueue.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                  <Users size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>No customers currently waiting</div>
                  <p style={{ fontSize: '13.5px', marginTop: '4px' }}>New customers who scan the QR will appear here in real-time.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th>Customer</th>
                        <th>Mobile</th>
                        <th>Wait Time</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitingQueue.map(item => (
                        <tr key={item.id}>
                          <td>
                            <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '16px' }}>
                              {item.token_number}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{item.customer_name}</div>
                            {item.visit_count > 1 && (
                              <span style={{ fontSize: '11px', color: '#027A48', background: '#ECFDF3', padding: '1px 6px', borderRadius: '4px' }}>
                                Repeat Guest ({item.visit_count} visits)
                              </span>
                            )}
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{item.customer_mobile}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                              <span>{Math.max(1, item.wait_minutes || 0)} min</span>
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-waiting">
                              <span className="badge-dot"></span>
                              Waiting
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button 
                              onClick={() => openCallModal(item)}
                              className="btn btn-primary"
                              style={{ padding: '8px 16px', fontSize: '13px' }}
                            >
                              <PhoneCall size={14} /> Call
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: QUEUE MANAGEMENT ================= */}
        {activeTab === 'queue' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  Queue Management
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Manage waiting list, call customers, and assign tables
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={loadQueue} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            </div>

            {/* Waiting Queue List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {waitingQueue.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                  <Users size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Queue is empty</div>
                  <p style={{ fontSize: '13.5px', marginTop: '4px' }}>All waiting customers have been seated!</p>
                </div>
              ) : (
                waitingQueue.map(item => (
                  <div key={item.id} className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ 
                        width: '76px', 
                        height: '76px', 
                        borderRadius: '16px', 
                        backgroundColor: 'var(--brand-red-subtle)', 
                        border: '1px solid var(--brand-red-border)', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        justifyContent: 'center' 
                      }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>TOKEN</span>
                        <span style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--brand-red)' }}>
                          {item.token_number}
                        </span>
                      </div>

                      <div>
                        <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{item.customer_name}</span>
                          {item.marketing_consent === 1 && (
                            <span title="Consented to offers" style={{ fontSize: '11px', background: '#F4F4F5', padding: '1px 6px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                              WhatsApp Opt-in
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Phone size={13} /> {item.customer_mobile}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={13} /> Waiting {Math.max(1, item.wait_minutes || 0)} min
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button 
                        onClick={() => openCallModal(item)}
                        className="btn btn-primary"
                        style={{ padding: '10px 20px', fontSize: '14px' }}
                      >
                        <PhoneCall size={15} /> Call Customer
                      </button>

                      <button 
                        onClick={() => handleSkip(item.id)}
                        className="btn btn-secondary"
                        style={{ padding: '10px 14px', fontSize: '13px' }}
                        title="Skip customer"
                      >
                        Skip
                      </button>

                      <button 
                        onClick={() => handleCancel(item.id)}
                        className="btn btn-danger-subtle"
                        style={{ padding: '10px 14px', fontSize: '13px' }}
                        title="Cancel customer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: TABLE MANAGEMENT ================= */}
        {activeTab === 'tables' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  Table Management
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Real-time status of all dining tables
                </p>
              </div>

              <button 
                onClick={() => setIsAddTableOpen(true)}
                className="btn btn-primary"
                style={{ padding: '9px 16px', fontSize: '13.5px' }}
              >
                <Plus size={16} /> Add Table
              </button>
            </div>

            {/* Status Legend */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <span className="badge-dot" style={{ backgroundColor: '#027A48' }}></span>
                <span>Available ({tables.filter(t => t.status === 'AVAILABLE').length})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <span className="badge-dot" style={{ backgroundColor: '#B42318' }}></span>
                <span>Occupied ({tables.filter(t => t.status === 'OCCUPIED').length})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <span className="badge-dot" style={{ backgroundColor: '#B54708' }}></span>
                <span>Preparing / Cleaning ({tables.filter(t => t.status === 'PREPARING').length})</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                <span className="badge-dot" style={{ backgroundColor: '#175CD3' }}></span>
                <span>Assigned ({tables.filter(t => t.status === 'ASSIGNED').length})</span>
              </div>
            </div>

            {/* Tables Grid */}
            <div className="tables-grid">
              {tables.map(table => {
                const getStatusBadge = () => {
                  switch (table.status) {
                    case 'AVAILABLE': return <span className="badge badge-available"><span className="badge-dot"></span> Available</span>;
                    case 'OCCUPIED': return <span className="badge badge-occupied"><span className="badge-dot"></span> Occupied</span>;
                    case 'PREPARING': return <span className="badge badge-preparing"><span className="badge-dot"></span> Preparing</span>;
                    case 'ASSIGNED': return <span className="badge badge-assigned"><span className="badge-dot"></span> Assigned</span>;
                    default: return <span className="badge">{table.status}</span>;
                  }
                };

                return (
                  <div key={table.id} className="table-card">
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Seats {table.capacity}</span>
                      {getStatusBadge()}
                    </div>

                    <div className="table-name">
                      {table.table_number}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      {table.section || 'Main Hall'}
                    </div>

                    {/* Quick status switch buttons */}
                    <div style={{ width: '100%', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {(table.status === 'OCCUPIED' || table.status === 'ASSIGNED') && (
                        <button 
                          onClick={() => {
                            // Find customer seated at this table
                            const seatedQueue = queue.find(q => q.assigned_table_id === table.id);
                            setBillingModalData({
                              customerId: seatedQueue ? seatedQueue.customer_id : (customers[0]?.id || ''),
                              customerName: seatedQueue ? seatedQueue.customer_name : `Table ${table.table_number} Guest`,
                              billAmount: '',
                              tableId: table.id
                            });
                          }}
                          className="btn btn-primary"
                          style={{ width: '100%', padding: '6px 10px', fontSize: '12px' }}
                        >
                          <Receipt size={13} /> Enter Bill / Checkout
                        </button>
                      )}

                      {table.status !== 'AVAILABLE' && (
                        <button 
                          onClick={() => updateTableStatus(table.id, 'AVAILABLE')}
                          className="btn btn-secondary"
                          style={{ width: '100%', padding: '6px 10px', fontSize: '12px' }}
                        >
                          Mark Available
                        </button>
                      )}

                      {table.status !== 'OCCUPIED' && (
                        <button 
                          onClick={() => updateTableStatus(table.id, 'OCCUPIED')}
                          className="btn btn-subtle"
                          style={{ width: '100%', padding: '6px 10px', fontSize: '12px' }}
                        >
                          Mark Occupied
                        </button>
                      )}

                      {table.status !== 'PREPARING' && (
                        <button 
                          onClick={() => updateTableStatus(table.id, 'PREPARING')}
                          className="btn btn-subtle"
                          style={{ width: '100%', padding: '6px 10px', fontSize: '12px' }}
                        >
                          Mark Preparing
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 4: CUSTOMER DIRECTORY & BILLING ================= */}
        {activeTab === 'customers' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  Customer Directory & Billing History
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Guest profiles, mobile numbers, visit counts, and lifetime dining bills
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {/* Instant Search Bar */}
                <div style={{ position: 'relative', width: '260px' }}>
                  <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text"
                    className="form-input"
                    placeholder="Search name or mobile..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    style={{ padding: '8px 12px 8px 34px', fontSize: '13px' }}
                  />
                </div>

                <button 
                  onClick={() => setBillingModalData({ customerId: customers[0]?.id || '', customerName: customers[0]?.name || '', billAmount: '' })}
                  className="btn btn-primary"
                  style={{ padding: '9px 16px', fontSize: '13.5px' }}
                >
                  <DollarSign size={16} /> Enter Bill
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Customer Name</th>
                    <th>Mobile Number</th>
                    <th>Visits</th>
                    <th>Last Visit</th>
                    <th>Latest Bill</th>
                    <th>Total Spend</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers
                    .filter(c => 
                      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                      c.mobile.includes(customerSearch)
                    )
                    .map(c => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        {c.marketing_consent === 1 ? (
                          <span style={{ fontSize: '11px', color: '#027A48' }}>✓ WhatsApp Opted-in</span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No marketing</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{c.mobile}</td>
                      <td>
                        <span style={{ fontWeight: 700 }}>{c.visit_count}</span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : 'Today'}
                      </td>
                      <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        ₹{c.latest_bill ? c.latest_bill.toLocaleString() : '0'}
                      </td>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-red)' }}>
                        ₹{c.total_spend ? c.total_spend.toLocaleString() : '0'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => viewCustomerProfile(c.id)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                          >
                            Profile
                          </button>
                          <button 
                            onClick={() => setBillingModalData({ customerId: c.id, customerName: c.name, billAmount: '' })}
                            className="btn btn-subtle"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                          >
                            + Bill
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= TAB: OFFERS & CAMPAIGNS ================= */}
        {activeTab === 'offers' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  Customer Retention & WhatsApp Offers
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Send offers to guests who opted-in during QR check-in, or test with your personal number
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="badge badge-available" style={{ fontSize: '12px' }}>
                  {customers.filter(c => c.marketing_consent === 1).length} Opted-In Guests
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 1fr', gap: '28px', alignItems: 'start' }}>
              {/* Column 1: Offer Composer */}
              <div className="card">
                <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>
                  Compose Campaign Offer
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '18px' }}>
                  Select a template or write a custom promotional message
                </p>

                {/* Quick Templates */}
                <div style={{ marginBottom: '18px' }}>
                  <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>Quick Templates</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    <button 
                      type="button"
                      onClick={() => {
                        setOfferTitle('Weekend Dining: 20% Off');
                        setOfferMessage('We would love to see you this weekend! Enjoy 20% off your total food bill on any table reserved before 8 PM.');
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '5px 10px', fontSize: '12px' }}
                    >
                      💳 20% Off Weekend
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setOfferTitle('Complimentary Dessert');
                        setOfferMessage('Dine with us this week and receive a complimentary Chef Special Gulab Jamun Cheesecake with any 2 main courses!');
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '5px 10px', fontSize: '12px' }}
                    >
                      🍰 Free Dessert
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setOfferTitle('VIP Loyalty Double Points');
                        setOfferMessage('As our valued guest, your next visit earns you DOUBLE loyalty points towards your dining vouchers.');
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '5px 10px', fontSize: '12px' }}
                    >
                      ⭐ Loyalty Double Points
                    </button>
                  </div>
                </div>

                <form onSubmit={handleDispatchOffer}>
                  <div className="form-group">
                    <label className="form-label">Offer Title</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={offerTitle} 
                      onChange={e => setOfferTitle(e.target.value)}
                      placeholder="e.g. Weekend Dining Special"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Offer Message</label>
                    <textarea 
                      className="form-input" 
                      rows={3}
                      value={offerMessage}
                      onChange={e => setOfferMessage(e.target.value)}
                      placeholder="Enter the offer details..."
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Channel</label>
                      <select 
                        className="form-input" 
                        value={offerChannel} 
                        onChange={e => setOfferChannel(e.target.value)}
                      >
                        <option value="WHATSAPP">WhatsApp (Recommended)</option>
                        <option value="SMS">SMS Gateway</option>
                        <option value="EMAIL">Email</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Recipients</label>
                      <select 
                        className="form-input"
                        value={offerRecipientMode}
                        onChange={e => setOfferRecipientMode(e.target.value)}
                      >
                        <option value="OPTED_IN">All Opted-In Guests ({customers.filter(c => c.marketing_consent === 1).length})</option>
                        <option value="CUSTOM">Specific Phone Number (Test)</option>
                      </select>
                    </div>
                  </div>

                  {offerRecipientMode === 'CUSTOM' && (
                    <div className="form-group">
                      <label className="form-label">Test Mobile Number</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. 9876543210 or your phone number"
                        value={customOfferMobile}
                        onChange={e => setCustomOfferMobile(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <button 
                    type="submit" 
                    disabled={isSendingOffer}
                    className="btn btn-primary btn-block btn-lg"
                    style={{ marginTop: '14px' }}
                  >
                    <Send size={16} /> {isSendingOffer ? 'Sending...' : `Dispatch ${offerChannel === 'WHATSAPP' ? 'WhatsApp' : offerChannel} Offer`}
                  </button>
                </form>
              </div>

              {/* Column 2: Live WhatsApp Preview & Free API Setup */}
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '10px' }}>
                  Live Message Preview (WhatsApp Format)
                </h2>

                {/* WhatsApp Chat Preview Card */}
                <div style={{ 
                  backgroundColor: '#ECE5DD', 
                  borderRadius: '16px', 
                  padding: '20px', 
                  border: '1px solid var(--border-subtle)',
                  boxShadow: 'var(--shadow-sm)',
                  marginBottom: '20px'
                }}>
                  <div style={{ 
                    backgroundColor: '#E7FFDB', 
                    borderRadius: '12px', 
                    padding: '12px 16px', 
                    maxWidth: '90%', 
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    position: 'relative'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#128C7E', marginBottom: '4px' }}>
                      {restaurant?.name || 'Saffron & Sage'} (Verified)
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '14px', color: '#111827', marginBottom: '4px' }}>
                      🎁 {offerTitle}
                    </div>
                    <div style={{ fontSize: '13px', color: '#1F2937', lineHeight: '1.45', marginBottom: '8px' }}>
                      {offerMessage}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6B7280', fontStyle: 'italic', borderTop: '1px dashed #CBD5E1', paddingTop: '6px' }}>
                      Show this message on your next visit to redeem!
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '10px', color: '#9CA3AF', marginTop: '4px' }}>
                      12:30 PM • <span style={{ color: '#34B7F1' }}>✓✓ Delivered</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Sent Logs */}
            {campaignLogs.length > 0 && (
              <div style={{ marginTop: '28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>
                  Recently Sent Offers Log
                </h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Recipient</th>
                        <th>Mobile</th>
                        <th>Offer Title</th>
                        <th>Channel</th>
                        <th>Status</th>
                        <th>Delivered Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignLogs.map((log, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{log.name}</td>
                          <td>{log.mobile}</td>
                          <td>{log.title}</td>
                          <td><span className="badge badge-assigned">{log.channel}</span></td>
                          <td><span className="badge badge-available">✓ {log.status}</span></td>
                          <td style={{ color: 'var(--text-muted)' }}>{new Date(log.sentAt).toLocaleTimeString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 5: QR CODE & TABLE STAND ================= */}
        {activeTab === 'qr' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  Restaurant QR Code
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Printable table stands & entrance QR poster for customer check-in
                </p>
              </div>

              <button 
                onClick={() => window.print()}
                className="btn btn-primary"
                style={{ padding: '9px 16px', fontSize: '13.5px' }}
              >
                <Printer size={16} /> Print Stand
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 420px) 1fr', gap: '32px', alignItems: 'start' }}>
              {/* Stand Card Preview */}
              <div className="card" style={{ textAlign: 'center', padding: '36px 28px', border: '2px solid var(--border-subtle)', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-red)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  DINEFLOW
                </div>
                <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '6px' }}>
                  {restaurant?.name || 'Saffron & Sage'}
                </h2>
                <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  Scan. Wait. Get Your Table.
                </p>

                {/* QR Code Image */}
                {qrInfo?.qrDataUrl ? (
                  <div style={{ margin: '0 auto 20px auto', display: 'inline-block', padding: '12px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                    <img src={qrInfo.qrDataUrl} alt="Restaurant DineFlow QR Code" style={{ width: '220px', height: '220px', display: 'block' }} />
                  </div>
                ) : (
                  <div style={{ width: '220px', height: '220px', background: '#FAFAFA', margin: '0 auto 20px auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Loading QR...
                  </div>
                )}

                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Scan with any camera
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  No app download needed. Check table availability or track your live queue.
                </p>

                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                  <a 
                    href={qrInfo?.targetUrl || `/restaurant/${restaurantId}`} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{ fontSize: '12.5px', color: 'var(--brand-red)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                  >
                    Open customer link in new tab <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* Instructions & Download */}
              <div className="card">
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>How it works</h3>
                <ul style={{ paddingLeft: '20px', color: 'var(--text-secondary)', lineHeight: '1.8', fontSize: '14px', marginBottom: '24px' }}>
                  <li>Place this QR card at the host stand, entrance, or waiting lounge.</li>
                  <li>Customers scan using standard iPhone or Android camera apps.</li>
                  <li>No mobile app install or account creation is required.</li>
                  <li>System automatically checks for available tables or assigns queue token.</li>
                </ul>

                <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Target URL</h3>
                <code style={{ display: 'block', background: '#F4F4F5', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', color: 'var(--text-primary)', wordBreak: 'break-all', marginBottom: '20px' }}>
                  {qrInfo?.targetUrl || window.location.origin + `/restaurant/${restaurantId}`}
                </code>

                <a 
                  href={qrInfo?.qrDataUrl} 
                  download={`dineflow-qr-${restaurantId}.png`}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex' }}
                >
                  <Download size={15} /> Download High-Res PNG
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 6: LED DISPLAY SIMULATOR ================= */}
        {activeTab === 'led' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  LED / TV Queue Display
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  Optional digital display for TV screens, waiting lounge monitors, or ESP32 LED panels
                </p>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                API Endpoint: <code>/api/display/{restaurantId}</code>
              </div>
            </div>

            {/* High-Contrast LED Screen Mockup */}
            <div style={{ 
              backgroundColor: '#09090B', 
              borderRadius: '24px', 
              padding: '48px 36px', 
              color: '#FFFFFF', 
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
              border: '4px solid #27272A'
            }}>
              <div style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '0.2em', color: '#A1A1AA', textTransform: 'uppercase', marginBottom: '8px' }}>
                {restaurant?.name || 'Saffron & Sage'}
              </div>

              <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '0.1em', color: '#EF4444', marginBottom: '24px' }}>
                NOW SERVING
              </div>

              <div style={{ 
                fontSize: '84px', 
                fontWeight: 900, 
                fontFamily: 'var(--font-mono)', 
                color: '#FFFFFF', 
                letterSpacing: '0.05em',
                lineHeight: '1',
                marginBottom: '16px'
              }}>
                {calledQueue[0] ? calledQueue[0].token_number : (waitingQueue[0] ? waitingQueue[0].token_number : '---')}
              </div>

              <div style={{ fontSize: '24px', fontWeight: 700, color: '#34D399', marginBottom: '32px' }}>
                {calledQueue[0] ? `PROCEED TO TABLE ${calledQueue[0].assigned_table_number || 'T-05'}` : 'PLEASE WAIT TO BE CALLED'}
              </div>

              <div style={{ display: 'inline-flex', gap: '32px', background: 'rgba(255,255,255,0.08)', padding: '12px 28px', borderRadius: '9999px', fontSize: '15px' }}>
                <span>WAITING IN LINE: <strong>{waitingQueue.length}</strong></span>
                <span>TABLES READY: <strong>{stats.availableTables}</strong></span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ================= MODAL: CALL CUSTOMER & ASSIGN TABLE ================= */}
      {callModalData && (
        <div className="modal-overlay" onClick={() => setCallModalData(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>
                Call {callModalData.queueEntry.token_number}?
              </h2>
              <button 
                onClick={() => setCallModalData(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
              Customer: <strong>{callModalData.queueEntry.customer_name}</strong> ({callModalData.queueEntry.customer_mobile})
            </p>

            <div className="form-group">
              <label className="form-label">Assign Available Table</label>
              <select 
                className="form-input"
                value={callModalData.selectedTableId}
                onChange={e => setCallModalData({ ...callModalData, selectedTableId: e.target.value })}
              >
                {tables.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.table_number} ({t.status} - Seats {t.capacity})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ 
              backgroundColor: 'var(--brand-red-subtle)', 
              borderRadius: 'var(--radius-md)', 
              padding: '12px 14px', 
              fontSize: '13px', 
              color: 'var(--text-secondary)',
              marginBottom: '24px'
            }}>
              This will update customer status to <strong>READY</strong>, assign the table, and trigger an instant SMS/WhatsApp notification.
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={handleConfirmCall}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                Assign & Call
              </button>
              <button 
                onClick={() => setCallModalData(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: BILLING AMOUNT ENTRY ================= */}
      {billingModalData && (
        <div className="modal-overlay" onClick={() => setBillingModalData(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>
                Enter Bill Amount
              </h2>
              <button 
                onClick={() => setBillingModalData(null)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '20px' }}>
              Customer: <strong>{billingModalData.customerName}</strong>
            </p>

            <form onSubmit={handleSaveBill}>
              <div className="form-group">
                <label className="form-label">Bill Amount (₹)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="form-input" 
                  placeholder="e.g. 2450" 
                  value={billingModalData.billAmount}
                  onChange={e => setBillingModalData({ ...billingModalData, billAmount: e.target.value })}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button 
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  Save Bill
                </button>
                <button 
                  type="button"
                  onClick={() => setBillingModalData(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD TABLE ================= */}
      {isAddTableOpen && (
        <div className="modal-overlay" onClick={() => setIsAddTableOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Add New Table</h2>
              <button onClick={() => setIsAddTableOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddTable}>
              <div className="form-group">
                <label className="form-label">Table Number</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. T-09" 
                  value={newTableNum} 
                  onChange={e => setNewTableNum(e.target.value)}
                  autoFocus
                  required 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Capacity (Seats)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  min="1" 
                  max="20" 
                  value={newTableCap} 
                  onChange={e => setNewTableCap(parseInt(e.target.value, 10))}
                  required 
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Create Table</button>
                <button type="button" onClick={() => setIsAddTableOpen(false)} className="btn btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CUSTOMER PROFILE ================= */}
      {selectedCustomer && (
        <div className="modal-overlay" onClick={() => setSelectedCustomer(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800 }}>
                {selectedCustomer.customer.name}
              </h2>
              <button onClick={() => setSelectedCustomer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div style={{ background: '#FAFAFA', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mobile</div>
                <div style={{ fontWeight: 600 }}>{selectedCustomer.customer.mobile}</div>
              </div>
              <div style={{ background: '#FAFAFA', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Visits</div>
                <div style={{ fontWeight: 800 }}>{selectedCustomer.customer.visit_count}</div>
              </div>
              <div style={{ background: '#FAFAFA', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Latest Bill</div>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>₹{selectedCustomer.customer.latest_bill?.toLocaleString() || 0}</div>
              </div>
              <div style={{ background: '#FAFAFA', padding: '12px', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Spend</div>
                <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--brand-red)' }}>₹{selectedCustomer.customer.total_spend?.toLocaleString() || 0}</div>
              </div>
            </div>

            <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>Visit History</h3>
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
              {selectedCustomer.visits.length === 0 ? (
                <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No recorded visits yet</div>
              ) : (
                selectedCustomer.visits.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-light)', fontSize: '13px' }}>
                    <span>{new Date(v.visit_date).toLocaleDateString()}</span>
                    <span>Table {v.table_number || 'Dining'}</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{v.bill_amount}</strong>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: '20px' }}>
              <button onClick={() => setSelectedCustomer(null)} className="btn btn-secondary btn-block">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Live Toast banner */}
      {toastMessage && (
        <div className="toast-banner">
          <CheckCircle size={18} style={{ color: '#34D399' }} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
