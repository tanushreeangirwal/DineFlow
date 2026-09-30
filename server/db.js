const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
const dbDir = isServerless ? '/tmp' : path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
  } catch (e) {}
}

const dbPath = isServerless ? path.join('/tmp', 'dineflow.db') : path.join(dbDir, 'dineflow.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency (or DELETE mode for serverless /tmp)
if (!isServerless) {
  try { db.pragma('journal_mode = WAL'); } catch (e) {}
}
try { db.pragma('foreign_keys = ON'); } catch (e) {}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tagline TEXT DEFAULT 'Scan. Wait. Get Your Table.',
      logo TEXT,
      address TEXT,
      contact_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      table_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, OCCUPIED, PREPARING, ASSIGNED
      capacity INTEGER DEFAULT 4,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      marketing_consent INTEGER DEFAULT 0,
      visit_count INTEGER DEFAULT 1,
      total_spend REAL DEFAULT 0.0,
      latest_bill REAL DEFAULT 0.0,
      last_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE,
      UNIQUE (restaurant_id, mobile)
    );

    CREATE TABLE IF NOT EXISTS queue_entries (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      token_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'WAITING', -- WAITING, READY, SERVED, SKIPPED, CANCELLED
      assigned_table_id TEXT,
      party_size INTEGER DEFAULT 2,
      seating_preference TEXT DEFAULT 'Any Table',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      called_at DATETIME,
      completed_at DATETIME,
      estimated_wait INTEGER DEFAULT 15,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_table_id) REFERENCES tables (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      table_id TEXT,
      queue_entry_id TEXT,
      bill_amount REAL DEFAULT 0.0,
      status TEXT DEFAULT 'COMPLETED',
      visit_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
      FOREIGN KEY (table_id) REFERENCES tables (id) ON DELETE SET NULL,
      FOREIGN KEY (queue_entry_id) REFERENCES queue_entries (id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      token_number TEXT,
      table_number TEXT,
      channel TEXT DEFAULT 'SMS_WHATSAPP',
      recipient TEXT,
      title TEXT,
      message TEXT,
      status TEXT DEFAULT 'SENT',
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT DEFAULT 'Mains',
      badge TEXT,
      is_available INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id, status);
    CREATE INDEX IF NOT EXISTS idx_queue_restaurant ON queue_entries(restaurant_id, status);
    CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id, mobile);
    CREATE INDEX IF NOT EXISTS idx_visits_restaurant ON visits(restaurant_id, customer_id);
  `);

  // Safely ensure columns exist for existing databases
  try { db.exec(`ALTER TABLE tables ADD COLUMN section TEXT DEFAULT 'Main Hall'`); } catch (e) {}
  try { db.exec(`ALTER TABLE visits ADD COLUMN payment_status TEXT DEFAULT 'PENDING'`); } catch (e) {}
  try { db.exec(`ALTER TABLE queue_entries ADD COLUMN party_size INTEGER DEFAULT 2`); } catch (e) {}
  try { db.exec(`ALTER TABLE queue_entries ADD COLUMN seating_preference TEXT DEFAULT 'Any Table'`); } catch (e) {}

  seedDefaultData();
  seedMenuItems();
}

function seedDefaultData() {
  const restaurantCount = db.prepare('SELECT COUNT(*) as count FROM restaurants').get().count;
  if (restaurantCount > 0) return;

  const defaultRestaurantId = 'rest-dineflow-01';

  const insertRestaurant = db.prepare(`
    INSERT INTO restaurants (id, name, tagline, logo, address, contact_number)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertRestaurant.run(
    defaultRestaurantId,
    'Saffron & Sage Fine Dining',
    'Scan. Wait. Get Your Table.',
    '🍽️',
    '42 Park View Boulevard, Downtown',
    '+91 98765 43210'
  );

  // Add initial tables: realistic full restaurant state
  const insertTable = db.prepare(`
    INSERT INTO tables (id, restaurant_id, table_number, status, capacity, section)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const initialTables = [
    { id: 'tab-01', num: 'T-01', status: 'OCCUPIED', capacity: 2, section: 'Window Booth' },
    { id: 'tab-02', num: 'T-02', status: 'OCCUPIED', capacity: 4, section: 'Main Hall' },
    { id: 'tab-03', num: 'T-03', status: 'OCCUPIED', capacity: 4, section: 'Main Hall' },
    { id: 'tab-04', num: 'T-04', status: 'OCCUPIED', capacity: 6, section: 'Outdoor Terrace' },
    { id: 'tab-05', num: 'T-05', status: 'PREPARING', capacity: 4, section: 'Main Hall' },
    { id: 'tab-06', num: 'T-06', status: 'OCCUPIED', capacity: 2, section: 'Window Booth' },
    { id: 'tab-07', num: 'T-07', status: 'OCCUPIED', capacity: 4, section: 'Main Hall' },
    { id: 'tab-08', num: 'T-08', status: 'ASSIGNED', capacity: 8, section: 'Main Hall' }
  ];

  for (const t of initialTables) {
    insertTable.run(t.id, defaultRestaurantId, t.num, t.status, t.capacity, t.section);
  }

  // Add initial sample customers & queue entries
  const insertCustomer = db.prepare(`
    INSERT INTO customers (id, restaurant_id, name, mobile, marketing_consent, visit_count, total_spend, latest_bill, last_visit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  insertCustomer.run('cust-01', defaultRestaurantId, 'Rahul Sharma', '+91 98201 12345', 1, 5, 11800.0, 2450.0, '-1 day');
  insertCustomer.run('cust-02', defaultRestaurantId, 'Priya Kapoor', '+91 98334 23456', 1, 3, 6200.0, 1850.0, '-3 days');
  insertCustomer.run('cust-03', defaultRestaurantId, 'Neha Verma', '+91 97690 34567', 0, 1, 1400.0, 1400.0, '-5 days');
  insertCustomer.run('cust-04', defaultRestaurantId, 'Vikram Mehta', '+91 99200 45678', 1, 8, 22400.0, 3100.0, '-2 days');
  insertCustomer.run('cust-05', defaultRestaurantId, 'Ananya Sen', '+91 98199 56789', 1, 2, 3800.0, 1900.0, '-7 days');

  // Insert sample completed visits
  const insertVisit = db.prepare(`
    INSERT INTO visits (id, restaurant_id, customer_id, table_id, bill_amount, status, visit_date)
    VALUES (?, ?, ?, ?, ?, 'COMPLETED', datetime('now', ?))
  `);
  insertVisit.run('vis-01', defaultRestaurantId, 'cust-01', 'tab-03', 2450.0, '-1 day');
  insertVisit.run('vis-02', defaultRestaurantId, 'cust-02', 'tab-04', 1850.0, '-3 days');
  insertVisit.run('vis-03', defaultRestaurantId, 'cust-04', 'tab-06', 3100.0, '-2 days');

  // Insert initial queue entries:
  // A-021 has been called and assigned to Table T-08 (READY)
  // A-022 and A-023 are in line (WAITING)
  const insertQueue = db.prepare(`
    INSERT INTO queue_entries (id, restaurant_id, customer_id, token_number, status, assigned_table_id, party_size, seating_preference, joined_at, called_at, estimated_wait)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), ?, ?)
  `);

  insertQueue.run('q-01', defaultRestaurantId, 'cust-01', 'A-021', 'READY', 'tab-08', 5, 'Any Table', '-15 minutes', new Date().toISOString(), 0);
  insertQueue.run('q-02', defaultRestaurantId, 'cust-02', 'A-022', 'WAITING', null, 2, 'Window Booth', '-8 minutes', null, 8);
  insertQueue.run('q-03', defaultRestaurantId, 'cust-03', 'A-023', 'WAITING', null, 4, 'Main Hall', '-4 minutes', null, 14);
}

function seedMenuItems() {
  const defaultRestaurantId = 'rest-dineflow-01';
  const count = db.prepare('SELECT COUNT(*) as count FROM menu_items WHERE restaurant_id = ?').get(defaultRestaurantId).count;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO menu_items (id, restaurant_id, name, description, price, category, badge)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const items = [
    { id: 'm-01', name: 'Dum Handi Biryani', desc: 'Slow-cooked aromatic basmati rice with fragrant saffron & spices', price: 480, cat: 'Signature', badge: 'Chef Special' },
    { id: 'm-02', name: 'Paneer Makhani Truffle', desc: 'Cottage cheese simmered in velvety tomato gravy with white truffle oil', price: 420, cat: 'Curries', badge: 'Popular' },
    { id: 'm-03', name: 'Smoked Garlic Naan & Kulcha', desc: 'Clay oven flatbread infused with smoked confit garlic and butter', price: 120, cat: 'Breads', badge: 'Must Try' },
    { id: 'm-04', name: 'Crispy Lotus Stem Honey Chilli', desc: 'Wok tossed lotus crisps with Kashmiri chilli and raw wildflower honey', price: 340, cat: 'Appetizers', badge: 'Top Rated' },
    { id: 'm-05', name: 'Gulab Jamun Cheesecake', desc: 'Fusion cardamon cream cheese on biscuit base topped with warm syrup', price: 290, cat: 'Desserts', badge: 'Signature' },
    { id: 'm-06', name: 'Kesar Pista Badam Lassi', desc: 'Chilled artisanal yoghurt blended with saffron strands and slivered nuts', price: 180, cat: 'Beverages', badge: 'Refreshing' }
  ];

  for (const item of items) {
    insert.run(item.id, defaultRestaurantId, item.name, item.desc, item.price, item.cat, item.badge);
  }
}

initDb();

module.exports = {
  db,
  initDb
};
