const EventEmitter = require('events');
const crypto = require('crypto');
const { db } = require('./db');

class NotificationEmitter extends EventEmitter {}
const notificationEvents = new NotificationEmitter();

/**
 * Standard Mock SMS / WhatsApp Provider
 * Simulates real-time dispatch and delivery for local development & demonstration
 */
class MockSmsWhatsAppProvider {
  constructor(name = 'MockSimulatedGateway') {
    this.name = name;
  }

  async send({ recipient, title, message, metadata }) {
    console.log(`\n================= [NOTIFICATION DISPATCHED] =================`);
    console.log(`Channel  : SMS / WhatsApp (${this.name})`);
    console.log(`To       : ${recipient}`);
    console.log(`Title    : ${title}`);
    console.log(`Message  :\n${message}`);
    if (metadata) console.log(`Metadata :`, metadata);
    console.log(`============================================================\n`);

    return {
      success: true,
      provider: this.name,
      messageSid: `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      status: 'DELIVERED'
    };
  }
}

class WebhookProvider {
  constructor(endpointUrl) {
    this.endpointUrl = endpointUrl;
    this.name = 'WebhookProvider';
  }

  async send(payload) {
    if (!this.endpointUrl) return { success: false, error: 'No webhook endpoint' };
    try {
      return { success: true, provider: this.name };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

class NotificationService {
  constructor() {
    this.providers = [new MockSmsWhatsAppProvider('SMS/WhatsApp Gateway')];
    this.history = [];
  }

  registerProvider(provider) {
    this.providers.push(provider);
  }

  /**
   * Primary hospitality notification: Table Ready (Call Customer)
   */
  async notifyTableReady({ restaurantId, customerId, tokenNumber, tableNumber, customerName, mobile, restaurantName }) {
    const title = 'Your Table is Ready';
    const message = `Your table is ready.\nToken: ${tokenNumber}\nTable: ${tableNumber}\nPlease proceed to the restaurant.`;
    const notificationId = 'notif-' + crypto.randomUUID();

    const payload = {
      id: notificationId,
      restaurantId,
      customerId,
      customerName,
      recipient: mobile,
      tokenNumber,
      tableNumber,
      restaurantName,
      title,
      message,
      type: 'TABLE_READY',
      sentAt: new Date().toISOString()
    };

    let dispatchResult = { success: true, provider: 'MockSimulatedGateway', messageSid: `mock-${Date.now()}` };
    for (const provider of this.providers) {
      try {
        const res = await provider.send(payload);
        if (res) dispatchResult = res;
      } catch (err) {
        console.error(`Provider error (${provider.name}):`, err);
        dispatchResult = { success: false, error: err.message };
      }
    }

    const status = dispatchResult.success ? 'DELIVERED' : 'FAILED';
    const messageSid = dispatchResult.messageSid || null;
    const error = dispatchResult.error || null;

    try {
      const insert = db.prepare(`
        INSERT INTO notifications (id, restaurant_id, customer_id, token_number, table_number, channel, recipient, title, message, status)
        VALUES (?, ?, ?, ?, ?, 'SMS_WHATSAPP', ?, ?, ?, ?)
      `);
      insert.run(notificationId, restaurantId, customerId, tokenNumber, tableNumber, mobile, title, message, status);
    } catch (err) {
      console.error('Failed to log notification in DB:', err);
    }

    payload.status = status;
    payload.messageSid = messageSid;
    payload.error = error;
    payload.success = dispatchResult.success;
    payload.provider = dispatchResult.provider || 'MockSimulatedGateway';

    this.history.unshift(payload);
    if (this.history.length > 50) this.history.pop();

    notificationEvents.emit('table_ready', payload);
    return payload;
  }

  /**
   * Automated proactive notification: Customer is NEXT in line!
   */
  async notifyNextInLine({ restaurantId, customerId, tokenNumber, customerName, mobile, restaurantName }) {
    const title = "You're Next in Line!";
    const message = `You are next in line at ${restaurantName || 'the restaurant'}!\nToken: ${tokenNumber}\nPlease proceed to the host reception desk. Your table will be ready momentarily.`;
    const notificationId = 'notif-' + crypto.randomUUID();

    const payload = {
      id: notificationId,
      restaurantId,
      customerId,
      customerName,
      recipient: mobile,
      tokenNumber,
      restaurantName,
      title,
      message,
      type: 'NEXT_IN_LINE',
      sentAt: new Date().toISOString()
    };

    let dispatchResult = { success: true, provider: 'MockSimulatedGateway', messageSid: `mock-${Date.now()}` };
    for (const provider of this.providers) {
      try {
        const res = await provider.send(payload);
        if (res) dispatchResult = res;
      } catch (err) {
        console.error(`Provider error (${provider.name}):`, err);
        dispatchResult = { success: false, error: err.message };
      }
    }

    const status = dispatchResult.success ? 'DELIVERED' : 'FAILED';
    const messageSid = dispatchResult.messageSid || null;
    const error = dispatchResult.error || null;

    try {
      const insert = db.prepare(`
        INSERT INTO notifications (id, restaurant_id, customer_id, token_number, channel, recipient, title, message, status)
        VALUES (?, ?, ?, ?, 'SMS_WHATSAPP', ?, ?, ?, ?)
      `);
      insert.run(notificationId, restaurantId, customerId, tokenNumber, mobile, title, message, status);
    } catch (err) {}

    payload.status = status;
    payload.messageSid = messageSid;
    payload.error = error;
    payload.success = dispatchResult.success;
    payload.provider = dispatchResult.provider || 'MockSimulatedGateway';

    notificationEvents.emit('next_in_line', payload);
    return payload;
  }

  /**
   * Promotional & Customer Retention Offers
   */
  async notifyCustomOffer({ restaurantId, recipient, customerName, title, message, channel = 'WHATSAPP', restaurantName }) {
    const notificationId = 'notif-' + crypto.randomUUID();

    const payload = {
      id: notificationId,
      restaurantId,
      customerName,
      recipient,
      title,
      message,
      restaurantName,
      channel,
      type: 'PROMOTIONAL_OFFER',
      sentAt: new Date().toISOString()
    };

    let dispatchResult = { success: true, provider: 'MockSimulatedGateway', messageSid: `mock-${Date.now()}` };
    for (const provider of this.providers) {
      try {
        const res = await provider.send(payload);
        if (res) dispatchResult = res;
      } catch (err) {
        console.error(`Provider error (${provider.name}):`, err);
        dispatchResult = { success: false, error: err.message };
      }
    }

    const status = dispatchResult.success ? 'DELIVERED' : 'FAILED';
    const messageSid = dispatchResult.messageSid || null;
    const error = dispatchResult.error || null;

    try {
      const insert = db.prepare(`
        INSERT INTO notifications (id, restaurant_id, customer_id, channel, recipient, title, message, status)
        VALUES (?, ?, 'CAMPAIGN', ?, ?, ?, ?, ?)
      `);
      insert.run(notificationId, restaurantId, channel, recipient, title, message, status);
    } catch (err) {}

    payload.status = status;
    payload.messageSid = messageSid;
    payload.error = error;
    payload.success = dispatchResult.success;
    payload.provider = dispatchResult.provider || 'MockSimulatedGateway';

    notificationEvents.emit('offer_sent', payload);
    return payload;
  }

  getRecentNotifications(restaurantId) {
    if (!restaurantId) return this.history;
    return this.history.filter(n => n.restaurantId === restaurantId);
  }
}

const notificationService = new NotificationService();

module.exports = {
  notificationService,
  notificationEvents,
  MockSmsWhatsAppProvider,
  WebhookProvider
};
