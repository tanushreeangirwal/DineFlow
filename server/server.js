const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const QRCode = require('qrcode');
const crypto = require('crypto');
const { db, initDb } = require('./db');
const { notificationService, notificationEvents } = require('./notificationService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// List of connected SSE clients per restaurant
const sseClients = new Map();

function sendSseUpdate(restaurantId, eventType, data) {
  const clients = sseClients.get(restaurantId);
  if (clients && clients.size > 0) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      res.write(payload);
    }
  }
}

// Listen to notification events to dispatch live SSE updates
notificationEvents.on('table_ready', (payload) => {
  sendSseUpdate(payload.restaurantId, 'notification', payload);
  sendSseUpdate(payload.restaurantId, 'queue_update', { reason: 'table_assigned', token: payload.tokenNumber });
});

notificationEvents.on('next_in_line', (payload) => {
  sendSseUpdate(payload.restaurantId, 'notification', payload);
  sendSseUpdate(payload.restaurantId, 'queue_update', { reason: 'next_in_line', token: payload.tokenNumber });
});

function checkAndNotifyNextCustomer(restaurantId) {
  try {
    const nextCustomer = db.prepare(`
      SELECT q.*, c.name as customer_name, c.mobile as customer_mobile, r.name as restaurant_name
      FROM queue_entries q
      JOIN customers c ON q.customer_id = c.id
      JOIN restaurants r ON q.restaurant_id = r.id
      WHERE q.restaurant_id = ? AND q.status = 'WAITING'
      ORDER BY q.joined_at ASC LIMIT 1
    `).get(restaurantId);

    if (nextCustomer) {
      notificationService.notifyNextInLine({
        restaurantId,
        customerId: nextCustomer.customer_id,
        tokenNumber: nextCustomer.token_number,
        customerName: nextCustomer.customer_name,
        mobile: nextCustomer.customer_mobile,
        restaurantName: nextCustomer.restaurant_name
      });
    }
  } catch (err) {
    console.error('Check next customer error:', err);
  }
}

// SSE endpoint for real-time reactivity
app.get('/api/stream/:restaurantId', (req, res) => {
  const { restaurantId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sseClients.has(restaurantId)) {
    sseClients.set(restaurantId, new Set());
  }
  const clientSet = sseClients.get(restaurantId);
  clientSet.add(res);

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);

  const keepAliveInterval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    clientSet.delete(res);
  });
});

// ---------------- RESTAURANTS ----------------
app.get('/api/restaurants', (req, res) => {
  try {
    const restaurants = db.prepare('SELECT * FROM restaurants ORDER BY name ASC').all();
    res.json(restaurants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/restaurants/:id', (req, res) => {
  try {
    const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });
    res.json(restaurant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restaurants', (req, res) => {
  try {
    const { name, tagline, logo, address, contact_number } = req.body;
    if (!name) return res.status(400).json({ error: 'Restaurant name is required' });

    const id = 'rest-' + crypto.randomUUID().slice(0, 8);
    const stmt = db.prepare(`
      INSERT INTO restaurants (id, name, tagline, logo, address, contact_number)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, name, tagline || 'Scan. Wait. Get Your Table.', logo || '🍽️', address || '', contact_number || '');

    // Create 5 default tables for this new restaurant
    const insertTable = db.prepare(`
      INSERT INTO tables (id, restaurant_id, table_number, status, capacity)
      VALUES (?, ?, ?, 'AVAILABLE', 4)
    `);
    for (let i = 1; i <= 5; i++) {
      insertTable.run(`tab-${id}-${i}`, id, `T-0${i}`);
    }

    const created = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/restaurants/:id', (req, res) => {
  try {
    const { name, tagline, logo, address, contact_number } = req.body;
    db.prepare(`
      UPDATE restaurants
      SET name = ?, tagline = ?, logo = ?, address = ?, contact_number = ?
      WHERE id = ?
    `).run(name, tagline, logo, address, contact_number, req.params.id);

    const updated = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- TABLES ----------------
app.get('/api/restaurants/:id/tables', (req, res) => {
  try {
    const tables = db.prepare(`
      SELECT * FROM tables 
      WHERE restaurant_id = ? 
      ORDER BY table_number ASC
    `).all(req.params.id);
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restaurants/:id/tables', (req, res) => {
  try {
    const { table_number, capacity } = req.body;
    if (!table_number) return res.status(400).json({ error: 'Table number is required' });

    const id = 'tab-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO tables (id, restaurant_id, table_number, status, capacity)
      VALUES (?, ?, ?, 'AVAILABLE', ?)
    `).run(id, req.params.id, table_number.toUpperCase().trim(), capacity || 4);

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
    sendSseUpdate(req.params.id, 'table_update', { table, action: 'created' });
    res.status(201).json(table);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tables/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['AVAILABLE', 'OCCUPIED', 'PREPARING', 'ASSIGNED'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Invalid table status' });
    }

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    db.prepare('UPDATE tables SET status = ? WHERE id = ?').run(status, req.params.id);
    const updated = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);

    sendSseUpdate(table.restaurant_id, 'table_update', { table: updated, action: 'status_changed' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- DASHBOARD STATS ----------------
app.get('/api/restaurants/:id/dashboard-stats', (req, res) => {
  try {
    const { id } = req.params;

    const waitingCount = db.prepare(`
      SELECT COUNT(*) as count FROM queue_entries
      WHERE restaurant_id = ? AND status = 'WAITING'
    `).get(id).count;

    const availableCount = db.prepare(`
      SELECT COUNT(*) as count FROM tables
      WHERE restaurant_id = ? AND status = 'AVAILABLE'
    `).get(id).count;

    const occupiedCount = db.prepare(`
      SELECT COUNT(*) as count FROM tables
      WHERE restaurant_id = ? AND status IN ('OCCUPIED', 'ASSIGNED')
    `).get(id).count;

    const servedTodayCount = db.prepare(`
      SELECT COUNT(*) as count FROM queue_entries
      WHERE restaurant_id = ? AND status = 'SERVED' 
      AND date(completed_at) = date('now')
    `).get(id).count;

    res.json({
      waiting: waitingCount,
      availableTables: availableCount,
      occupied: occupiedCount,
      servedToday: servedTodayCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- QUEUE MANAGEMENT ----------------
app.get('/api/restaurants/:id/queue', (req, res) => {
  try {
    const { id } = req.params;
    const entries = db.prepare(`
      SELECT 
        q.*,
        c.name as customer_name,
        c.mobile as customer_mobile,
        c.marketing_consent,
        c.visit_count,
        t.table_number as assigned_table_number,
        ROUND((julianday('now') - julianday(q.joined_at)) * 1440) as wait_minutes
      FROM queue_entries q
      JOIN customers c ON q.customer_id = c.id
      LEFT JOIN tables t ON q.assigned_table_id = t.id
      WHERE q.restaurant_id = ? AND q.status IN ('WAITING', 'READY')
      ORDER BY 
        CASE q.status 
          WHEN 'READY' THEN 1 
          WHEN 'WAITING' THEN 2 
          ELSE 3 
        END,
        q.joined_at ASC
    `).all(id);

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- CUSTOMER CHECK-IN (QR Flow) ----------------
/**
 * Customer scans QR -> Enters Name + Mobile + optional consent.
 * Evaluates table availability:
 * - If AVAILABLE table exists -> Assigns immediately (STATE A)
 * - If NO table available -> Generates token, adds to queue (STATE B)
 */
app.post('/api/customer/check-in', (req, res) => {
  try {
    const { restaurantId, name, mobile, marketingConsent } = req.body;

    if (!restaurantId || !name || !mobile) {
      return res.status(400).json({ error: 'Restaurant ID, name, and mobile number are required' });
    }

    const cleanMobile = mobile.trim();
    const cleanName = name.trim();
    const consent = marketingConsent ? 1 : 0;

    // 1. Find or create customer
    let customer = db.prepare('SELECT * FROM customers WHERE restaurant_id = ? AND mobile = ?')
      .get(restaurantId, cleanMobile);

    if (customer) {
      db.prepare(`
        UPDATE customers 
        SET name = ?, marketing_consent = ?, last_visit = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cleanName, consent, customer.id);
      customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
    } else {
      const customerId = 'cust-' + crypto.randomUUID().slice(0, 8);
      db.prepare(`
        INSERT INTO customers (id, restaurant_id, name, mobile, marketing_consent, visit_count, total_spend, latest_bill)
        VALUES (?, ?, ?, ?, ?, 1, 0, 0)
      `).run(customerId, restaurantId, cleanName, cleanMobile, consent);
      customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    }

    // 2. Check for active waiting or ready queue entry for this customer
    const activeEntry = db.prepare(`
      SELECT q.*, t.table_number as assigned_table_number
      FROM queue_entries q
      LEFT JOIN tables t ON q.assigned_table_id = t.id
      WHERE q.restaurant_id = ? AND q.customer_id = ? AND q.status IN ('WAITING', 'READY')
      ORDER BY q.joined_at DESC LIMIT 1
    `).get(restaurantId, customer.id);

    if (activeEntry) {
      // Reconnect customer to their existing active queue or ready state
      const currentlyServing = db.prepare(`
        SELECT token_number FROM queue_entries 
        WHERE restaurant_id = ? AND status = 'READY'
        ORDER BY called_at DESC LIMIT 1
      `).get(restaurantId)?.token_number || 'A-001';

      const peopleAhead = db.prepare(`
        SELECT COUNT(*) as count FROM queue_entries
        WHERE restaurant_id = ? AND status = 'WAITING' AND joined_at < ?
      `).get(restaurantId, activeEntry.joined_at).count;

      return res.json({
        state: activeEntry.status === 'READY' ? 'TABLE_READY' : 'QUEUE_JOINED',
        queueEntry: activeEntry,
        customer,
        currentlyServing,
        peopleAhead,
        estimatedWait: Math.max(5, peopleAhead * 5),
        isExistingSession: true
      });
    }

    // 3. Check for available tables
    const availableTable = db.prepare(`
      SELECT * FROM tables 
      WHERE restaurant_id = ? AND status = 'AVAILABLE'
      ORDER BY table_number ASC LIMIT 1
    `).get(restaurantId);

    if (availableTable) {
      // STATE A: Table Available!
      // Assign table right away
      db.prepare(`UPDATE tables SET status = 'ASSIGNED' WHERE id = ?`).run(availableTable.id);

      // Create an instant ready queue entry / visit
      const tokenNumber = generateNextToken(restaurantId);
      const queueEntryId = 'q-' + crypto.randomUUID().slice(0, 8);

      db.prepare(`
        INSERT INTO queue_entries (id, restaurant_id, customer_id, token_number, status, assigned_table_id, joined_at, called_at, estimated_wait)
        VALUES (?, ?, ?, ?, 'READY', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
      `).run(queueEntryId, restaurantId, customer.id, tokenNumber, availableTable.id);

      const queueEntry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueEntryId);

      // Trigger notification
      notificationService.notifyTableReady({
        restaurantId,
        customerId: customer.id,
        tokenNumber,
        tableNumber: availableTable.table_number,
        customerName: customer.name,
        mobile: customer.mobile
      });

      sendSseUpdate(restaurantId, 'table_assigned', {
        queueEntry,
        table: availableTable,
        customer
      });

      return res.json({
        state: 'TABLE_AVAILABLE',
        table: availableTable,
        queueEntry,
        customer
      });
    } else {
      // STATE B: Table NOT Available -> Join Waiting Queue
      const tokenNumber = generateNextToken(restaurantId);
      const queueEntryId = 'q-' + crypto.randomUUID().slice(0, 8);

      // Calculate people ahead
      const peopleAhead = db.prepare(`
        SELECT COUNT(*) as count FROM queue_entries
        WHERE restaurant_id = ? AND status = 'WAITING'
      `).get(restaurantId).count;

      const estimatedWait = Math.max(10, (peopleAhead + 1) * 5);

      db.prepare(`
        INSERT INTO queue_entries (id, restaurant_id, customer_id, token_number, status, joined_at, estimated_wait)
        VALUES (?, ?, ?, ?, 'WAITING', CURRENT_TIMESTAMP, ?)
      `).run(queueEntryId, restaurantId, customer.id, tokenNumber, estimatedWait);

      const queueEntry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueEntryId);

      // Get currently serving token
      const currentlyServing = db.prepare(`
        SELECT token_number FROM queue_entries
        WHERE restaurant_id = ? AND status IN ('READY', 'SERVED')
        ORDER BY coalesce(called_at, completed_at) DESC LIMIT 1
      `).get(restaurantId)?.token_number || 'A-020';

      sendSseUpdate(restaurantId, 'new_queue_entry', {
        queueEntry,
        customer,
        peopleAhead
      });

      return res.json({
        state: 'QUEUE_JOINED',
        queueEntry,
        tokenNumber,
        currentlyServing,
        peopleAhead,
        estimatedWait,
        customer
      });
    }
  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: err.message });
  }
});

function generateNextToken(restaurantId) {
  // Find highest token today
  const lastEntry = db.prepare(`
    SELECT token_number FROM queue_entries
    WHERE restaurant_id = ?
    ORDER BY joined_at DESC LIMIT 1
  `).get(restaurantId);

  let nextNum = 21;
  if (lastEntry && lastEntry.token_number) {
    const match = lastEntry.token_number.match(/([A-Z])-?(\d+)/);
    if (match) {
      nextNum = parseInt(match[2], 10) + 1;
    }
  }
  const padded = String(nextNum).padStart(3, '0');
  return `A-${padded}`;
}

// ---------------- LIVE CUSTOMER QUEUE STATUS ----------------
app.get('/api/queue/:queueEntryId/status', (req, res) => {
  try {
    const entry = db.prepare(`
      SELECT 
        q.*,
        c.name as customer_name,
        c.mobile as customer_mobile,
        t.table_number as assigned_table_number,
        r.name as restaurant_name
      FROM queue_entries q
      JOIN customers c ON q.customer_id = c.id
      JOIN restaurants r ON q.restaurant_id = r.id
      LEFT JOIN tables t ON q.assigned_table_id = t.id
      WHERE q.id = ?
    `).get(req.params.queueEntryId);

    if (!entry) return res.status(404).json({ error: 'Queue entry not found' });

    // Calculate people ahead
    const peopleAhead = db.prepare(`
      SELECT COUNT(*) as count FROM queue_entries
      WHERE restaurant_id = ? AND status = 'WAITING' AND joined_at < ?
    `).get(entry.restaurant_id, entry.joined_at).count;

    // Calculate currently serving token
    const currentlyServing = db.prepare(`
      SELECT token_number FROM queue_entries
      WHERE restaurant_id = ? AND status IN ('READY', 'SERVED')
      ORDER BY coalesce(called_at, completed_at) DESC LIMIT 1
    `).get(entry.restaurant_id)?.token_number || 'A-020';

    res.json({
      queueEntry: entry,
      currentlyServing,
      peopleAhead,
      estimatedWait: Math.max(5, peopleAhead * 5),
      status: entry.status,
      assignedTable: entry.assigned_table_number
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- STAFF ACTION: CALL CUSTOMER ----------------
app.post('/api/queue/:queueEntryId/call', async (req, res) => {
  try {
    const { tableId } = req.body;
    const { queueEntryId } = req.params;

    if (!tableId) return res.status(400).json({ error: 'Table selection is required to call customer' });

    const queueEntry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueEntryId);
    if (!queueEntry) return res.status(404).json({ error: 'Queue entry not found' });

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(queueEntry.customer_id);
    const restaurant = db.prepare('SELECT name FROM restaurants WHERE id = ?').get(queueEntry.restaurant_id);

    // 1. Assign table to customer & set status to READY
    db.prepare(`
      UPDATE queue_entries
      SET status = 'READY', assigned_table_id = ?, called_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(tableId, queueEntryId);

    // 2. Update table status to ASSIGNED
    db.prepare(`UPDATE tables SET status = 'ASSIGNED' WHERE id = ?`).run(tableId);

    // 3. Trigger Notification
    const notif = await notificationService.notifyTableReady({
      restaurantId: queueEntry.restaurant_id,
      customerId: customer.id,
      tokenNumber: queueEntry.token_number,
      tableNumber: table.table_number,
      customerName: customer.name,
      mobile: customer.mobile,
      restaurantName: restaurant?.name
    });

    const updatedQueue = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueEntryId);
    const updatedTable = db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId);

    sendSseUpdate(queueEntry.restaurant_id, 'queue_update', {
      action: 'customer_called',
      queueEntry: updatedQueue,
      table: updatedTable,
      notification: notif
    });

    res.json({
      success: true,
      queueEntry: updatedQueue,
      table: updatedTable,
      notification: notif
    });
  } catch (err) {
    console.error('Call error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- STAFF ACTION: RECALL CUSTOMER ----------------
app.post('/api/queue/:queueEntryId/recall', async (req, res) => {
  try {
    const { queueEntryId } = req.params;
    const queueEntry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueEntryId);
    if (!queueEntry) return res.status(404).json({ error: 'Queue entry not found' });

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(queueEntry.customer_id);
    const restaurant = db.prepare('SELECT name FROM restaurants WHERE id = ?').get(queueEntry.restaurant_id);
    const table = queueEntry.assigned_table_id ? db.prepare('SELECT * FROM tables WHERE id = ?').get(queueEntry.assigned_table_id) : null;

    const notif = await notificationService.notifyTableReady({
      restaurantId: queueEntry.restaurant_id,
      customerId: customer.id,
      tokenNumber: queueEntry.token_number,
      tableNumber: table ? table.table_number : 'Assigned Table',
      customerName: customer.name,
      mobile: customer.mobile,
      restaurantName: restaurant?.name
    });

    res.json({ success: true, message: 'Notification re-sent successfully', notification: notif });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- STAFF ACTION: MARK SERVED ----------------
app.post('/api/queue/:queueEntryId/served', (req, res) => {
  try {
    const { queueEntryId } = req.params;
    const queueEntry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueEntryId);
    if (!queueEntry) return res.status(404).json({ error: 'Queue entry not found' });

    // Update queue entry
    db.prepare(`
      UPDATE queue_entries 
      SET status = 'SERVED', completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(queueEntryId);

    // Update table to OCCUPIED
    if (queueEntry.assigned_table_id) {
      db.prepare(`UPDATE tables SET status = 'OCCUPIED' WHERE id = ?`).run(queueEntry.assigned_table_id);
    }

    // Create a visit record
    const visitId = 'vis-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO visits (id, restaurant_id, customer_id, table_id, queue_entry_id, status)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE')
    `).run(visitId, queueEntry.restaurant_id, queueEntry.customer_id, queueEntry.assigned_table_id, queueEntryId);

    // Increment customer visit count
    db.prepare(`
      UPDATE customers 
      SET visit_count = visit_count + 1, last_visit = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(queueEntry.customer_id);

    sendSseUpdate(queueEntry.restaurant_id, 'queue_update', {
      action: 'customer_served',
      queueEntryId,
      visitId
    });

    // Proactively notify the next customer in line
    checkAndNotifyNextCustomer(queueEntry.restaurant_id);

    res.json({ success: true, visitId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- STAFF ACTION: SKIP / CANCEL ----------------
app.post('/api/queue/:queueEntryId/skip', (req, res) => {
  try {
    const { queueEntryId } = req.params;
    const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueEntryId);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    if (entry.assigned_table_id) {
      db.prepare(`UPDATE tables SET status = 'AVAILABLE' WHERE id = ?`).run(entry.assigned_table_id);
    }

    db.prepare(`UPDATE queue_entries SET status = 'SKIPPED', completed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(queueEntryId);
    sendSseUpdate(entry.restaurant_id, 'queue_update', { action: 'skipped', queueEntryId });
    
    // Proactively notify next customer
    checkAndNotifyNextCustomer(entry.restaurant_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/queue/:queueEntryId/cancel', (req, res) => {
  try {
    const { queueEntryId } = req.params;
    const entry = db.prepare('SELECT * FROM queue_entries WHERE id = ?').get(queueEntryId);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    if (entry.assigned_table_id) {
      db.prepare(`UPDATE tables SET status = 'AVAILABLE' WHERE id = ?`).run(entry.assigned_table_id);
    }

    db.prepare(`UPDATE queue_entries SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(queueEntryId);
    sendSseUpdate(entry.restaurant_id, 'queue_update', { action: 'cancelled', queueEntryId });
    
    // Proactively notify next customer
    checkAndNotifyNextCustomer(entry.restaurant_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- CUSTOMERS & BILLING ----------------
app.get('/api/restaurants/:id/customers', (req, res) => {
  try {
    const customers = db.prepare(`
      SELECT * FROM customers 
      WHERE restaurant_id = ? 
      ORDER BY last_visit DESC
    `).all(req.params.id);
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/:id', (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const visits = db.prepare(`
      SELECT v.*, t.table_number
      FROM visits v
      LEFT JOIN tables t ON v.table_id = t.id
      WHERE v.customer_id = ?
      ORDER BY v.visit_date DESC
    `).all(req.params.id);

    res.json({ customer, visits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Billing: Manual entry of bill amount after customer has been served.
 */
app.post('/api/billing', (req, res) => {
  try {
    const { customerId, restaurantId, billAmount, tableId } = req.body;
    const amount = parseFloat(billAmount);

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid bill amount is required' });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    // Find active visit or create one
    let activeVisit = db.prepare(`
      SELECT * FROM visits 
      WHERE customer_id = ? AND status = 'ACTIVE'
      ORDER BY visit_date DESC LIMIT 1
    `).get(customerId);

    if (activeVisit) {
      db.prepare(`
        UPDATE visits 
        SET bill_amount = ?, status = 'COMPLETED'
        WHERE id = ?
      `).run(amount, activeVisit.id);
    } else {
      const visitId = 'vis-' + crypto.randomUUID().slice(0, 8);
      db.prepare(`
        INSERT INTO visits (id, restaurant_id, customer_id, table_id, bill_amount, status)
        VALUES (?, ?, ?, ?, ?, 'COMPLETED')
      `).run(visitId, restaurantId || customer.restaurant_id, customerId, tableId || null, amount);
    }

    // Update customer total_spend and latest_bill
    db.prepare(`
      UPDATE customers 
      SET total_spend = total_spend + ?, latest_bill = ?, last_visit = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, amount, customerId);

    // If tableId provided or was in visit, table can now be set to PREPARING for cleanup!
    if (tableId) {
      db.prepare(`UPDATE tables SET status = 'PREPARING' WHERE id = ?`).run(tableId);
    }

    const updatedCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

    sendSseUpdate(customer.restaurant_id, 'billing_updated', { customer: updatedCustomer, amount });

    res.json({
      success: true,
      message: 'Bill saved successfully',
      customer: updatedCustomer,
      billAmount: amount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- PUBLIC TABLES OVERVIEW (FOR CUSTOMERS) ----------------
app.get('/api/restaurants/:id/public-tables', (req, res) => {
  try {
    const tables = db.prepare(`
      SELECT id, table_number, status, capacity, coalesce(section, 'Main Hall') as section
      FROM tables
      WHERE restaurant_id = ?
      ORDER BY table_number ASC
    `).all(req.params.id);

    const summary = {
      total: tables.length,
      available: tables.filter(t => t.status === 'AVAILABLE').length,
      occupied: tables.filter(t => t.status === 'OCCUPIED' || t.status === 'ASSIGNED').length,
      preparing: tables.filter(t => t.status === 'PREPARING').length,
      tables
    };
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- RESTAURANT MENU / SPECIALS ----------------
app.get('/api/restaurants/:id/menu', (req, res) => {
  try {
    const items = db.prepare(`
      SELECT * FROM menu_items
      WHERE restaurant_id = ? AND is_available = 1
      ORDER BY category ASC, price ASC
    `).all(req.params.id);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- CUSTOMER ACTIVE BILL & RECEIPT ----------------
app.get('/api/customer/:customerId/active-bill', (req, res) => {
  try {
    const { customerId } = req.params;
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    // Look for active or latest visit
    const visit = db.prepare(`
      SELECT v.*, t.table_number, coalesce(t.section, 'Main Hall') as section, r.name as restaurant_name
      FROM visits v
      LEFT JOIN tables t ON v.table_id = t.id
      JOIN restaurants r ON v.restaurant_id = r.id
      WHERE v.customer_id = ?
      ORDER BY v.visit_date DESC LIMIT 1
    `).get(customerId);

    if (!visit || (!visit.bill_amount && visit.status !== 'ACTIVE')) {
      // If customer has a ready queue entry, get the assigned table
      const activeQueue = db.prepare(`
        SELECT q.*, t.table_number, coalesce(t.section, 'Main Hall') as section
        FROM queue_entries q
        LEFT JOIN tables t ON q.assigned_table_id = t.id
        WHERE q.customer_id = ? AND q.status IN ('READY', 'WAITING')
        ORDER BY q.joined_at DESC LIMIT 1
      `).get(customerId);

      return res.json({
        hasActiveBill: false,
        customer,
        activeQueue,
        table: activeQueue ? { table_number: activeQueue.table_number, section: activeQueue.section } : null,
        message: 'No active bill generated yet. Bill will appear here once served.'
      });
    }

    const subtotal = visit.bill_amount ? Math.round((visit.bill_amount / 1.05) * 100) / 100 : 0;
    const gst = Math.round((visit.bill_amount - subtotal) * 100) / 100;

    res.json({
      hasActiveBill: true,
      visitId: visit.id,
      customer,
      tableNumber: visit.table_number || 'T-05',
      section: visit.section,
      restaurantName: visit.restaurant_name,
      subtotal,
      gst,
      totalAmount: visit.bill_amount,
      status: visit.payment_status || 'PENDING',
      visitDate: visit.visit_date
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- BILL PAYMENT SIMULATION ----------------
app.post('/api/visits/:id/pay', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare(`UPDATE visits SET payment_status = 'PAID' WHERE id = ?`).run(id);
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(id);
    sendSseUpdate(visit.restaurant_id, 'billing_updated', { visit, action: 'paid' });
    res.json({ success: true, message: 'Payment recorded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- QR CODE GENERATION ----------------
app.get('/api/restaurants/:id/qr', async (req, res) => {
  try {
    const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

    // Host URL calculation (can be customized by origin or request)
    const host = req.get('host');
    const protocol = req.protocol;
    // Front-end route for customer
    const targetUrl = `${protocol}://${host}/restaurant/${req.params.id}`;

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      margin: 2,
      width: 400,
      color: {
        dark: '#18181B', // Charcoal
        light: '#FFFFFF'
      }
    });

    const qrSvg = await QRCode.toString(targetUrl, { type: 'svg', margin: 2 });

    res.json({
      targetUrl,
      qrDataUrl,
      qrSvg,
      restaurant
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- OPTIONAL LED DISPLAY / KIOSK ENDPOINT ----------------
/**
 * Simple JSON endpoint for ESP32 / Digital LED display or TV monitor:
 * Shows NOW SERVING token and Table!
 */
app.get('/api/display/:restaurantId', (req, res) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = db.prepare('SELECT name FROM restaurants WHERE id = ?').get(restaurantId);
    if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

    // Get current now serving
    const readyEntry = db.prepare(`
      SELECT q.token_number, t.table_number, q.called_at
      FROM queue_entries q
      LEFT JOIN tables t ON q.assigned_table_id = t.id
      WHERE q.restaurant_id = ? AND q.status = 'READY'
      ORDER BY q.called_at DESC LIMIT 1
    `).get(restaurantId);

    const waitingCount = db.prepare(`
      SELECT COUNT(*) as count FROM queue_entries
      WHERE restaurant_id = ? AND status = 'WAITING'
    `).get(restaurantId).count;

    res.json({
      restaurantName: restaurant.name,
      nowServing: readyEntry ? readyEntry.token_number : '---',
      assignedTable: readyEntry ? readyEntry.table_number : '---',
      status: readyEntry ? 'PLEASE PROCEED' : 'WELCOME',
      waitingCount,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- NOTIFICATIONS LOG ----------------
app.get('/api/restaurants/:id/notifications', (req, res) => {
  try {
    const list = db.prepare(`
      SELECT * FROM notifications 
      WHERE restaurant_id = ? 
      ORDER BY sent_at DESC LIMIT 30
    `).all(req.params.id);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- CAMPAIGN OFFERS DISPATCHER ----------------
app.post('/api/restaurants/:id/send-offer', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, channel, selectedMobile } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    let recipients = [];
    if (selectedMobile) {
      const cust = db.prepare('SELECT name, mobile FROM customers WHERE restaurant_id = ? AND mobile = ?').get(id, selectedMobile);
      recipients = [cust || { name: 'Guest', mobile: selectedMobile }];
    } else {
      recipients = db.prepare(`
        SELECT name, mobile FROM customers 
        WHERE restaurant_id = ? AND marketing_consent = 1
      `).all(id);
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No opted-in customers found with marketing consent' });
    }

    const restaurant = db.prepare('SELECT name FROM restaurants WHERE id = ?').get(id);

    const logs = [];
    let failureCount = 0;
    let lastError = null;

    for (const r of recipients) {
      const fullMessage = `🎁 [${restaurant?.name || 'DineFlow'}] Special Offer:\n*${title}*\n${message}\n\nShow this message on your next visit to redeem!`;
      
      const payload = await notificationService.notifyCustomOffer({
        restaurantId: id,
        recipient: r.mobile,
        customerName: r.name,
        title,
        message: fullMessage,
        restaurantName: restaurant?.name,
        channel: channel || 'WHATSAPP'
      });

      if (!payload.success) {
        failureCount++;
        lastError = payload.error;
      }

      logs.push({
        id: payload.id,
        name: r.name,
        mobile: r.mobile,
        title,
        channel: channel || 'WHATSAPP',
        status: payload.status,
        messageSid: payload.messageSid,
        error: payload.error,
        provider: payload.provider,
        sentAt: new Date().toISOString()
      });
    }

    if (failureCount > 0 && failureCount === logs.length) {
      return res.status(400).json({
        success: false,
        error: `WhatsApp delivery failed: ${lastError}`,
        logs
      });
    }

    const deliveredCount = logs.filter(l => l.status === 'DELIVERED').length;
    res.json({
      success: true,
      message: `Offer dispatched successfully to ${deliveredCount} customer(s)!`,
      sentCount: deliveredCount,
      logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static frontend build if available
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// Start Express Server
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`DineFlow Backend API running at http://localhost:${PORT}`);
  });
}

module.exports = app;
