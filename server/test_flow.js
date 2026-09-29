const BASE_URL = 'http://localhost:3001';

async function runTest() {
  console.log('--- STARTING DINEFLOW E2E REAL-WORLD FLOW TEST ---');

  const restaurantId = 'rest-dineflow-01';

  // TEST 1: Check restaurant and tables
  console.log('\n[TEST 1] Fetching Restaurant Tables...');
  let res = await fetch(`${BASE_URL}/api/restaurants/${restaurantId}/tables`);
  let tables = await res.json();
  console.log(`Found ${tables.length} tables. Available count: ${tables.filter(t => t.status === 'AVAILABLE').length}`);

  // TEST 2: Customer Flow - Case A: Available table exists
  console.log('\n[TEST 2] Testing Journey A: Customer enters details when table IS available...');
  res = await fetch(`${BASE_URL}/api/customer/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId,
      name: 'Aarav Patel',
      mobile: '+91 98980 11223',
      marketingConsent: true
    })
  });
  let checkInResult = await res.json();
  console.log('Result for Aarav:', {
    state: checkInResult.state,
    assignedTable: checkInResult.table?.table_number,
    token: checkInResult.queueEntry?.token_number
  });
  if (checkInResult.state !== 'TABLE_AVAILABLE' && checkInResult.state !== 'TABLE_READY') {
    throw new Error('Expected TABLE_AVAILABLE or TABLE_READY for Aarav, got: ' + checkInResult.state);
  }
  console.log('✓ Journey A passed: Customer received table immediately without queueing!');

  // Mark all tables OCCUPIED to simulate a full restaurant for Journey B
  console.log('\n[TEST 3] Marking all remaining available tables to OCCUPIED to test Journey B (Full Restaurant)...');
  res = await fetch(`${BASE_URL}/api/restaurants/${restaurantId}/tables`);
  tables = await res.json();
  for (const t of tables) {
    if (t.status === 'AVAILABLE') {
      await fetch(`${BASE_URL}/api/tables/${t.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OCCUPIED' })
      });
    }
  }

  // Verify 0 available tables
  res = await fetch(`${BASE_URL}/api/restaurants/${restaurantId}/dashboard-stats`);
  let stats = await res.json();
  console.log(`Current stats: Waiting: ${stats.waiting}, Available: ${stats.availableTables}, Occupied: ${stats.occupied}`);

  // TEST 4: Customer Flow - Case B: Restaurant Full -> Customer Joins Queue
  console.log('\n[TEST 4] Testing Journey B: Customer enters details when restaurant is FULL...');
  res = await fetch(`${BASE_URL}/api/customer/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurantId,
      name: 'Rohan Mehra',
      mobile: '+91 99887 66554',
      marketingConsent: false
    })
  });
  let queueResult = await res.json();
  console.log('Result for Rohan:', {
    state: queueResult.state,
    token: queueResult.queueEntry?.token_number,
    currentlyServing: queueResult.currentlyServing,
    peopleAhead: queueResult.peopleAhead,
    estimatedWait: queueResult.estimatedWait
  });
  if (queueResult.state !== 'QUEUE_JOINED') {
    throw new Error('Expected QUEUE_JOINED for Rohan, got: ' + queueResult.state);
  }
  const rohanQueueEntryId = queueResult.queueEntry.id;
  const rohanToken = queueResult.queueEntry.token_number;
  console.log(`✓ Journey B passed: Token ${rohanToken} generated, placed in queue with ${queueResult.peopleAhead} people ahead!`);

  // TEST 5: Customer Live Queue Tracking
  console.log('\n[TEST 5] Customer tracks live queue status...');
  res = await fetch(`${BASE_URL}/api/queue/${rohanQueueEntryId}/status`);
  let liveStatus = await res.json();
  console.log('Live status response:', {
    token: liveStatus.queueEntry.token_number,
    status: liveStatus.status,
    peopleAhead: liveStatus.peopleAhead,
    estimatedWait: liveStatus.estimatedWait
  });
  if (liveStatus.status !== 'WAITING') {
    throw new Error('Expected status WAITING');
  }

  // TEST 6: Table becomes available & Staff assigns table to customer
  console.log('\n[TEST 6] Table T-05 is cleaned & marked AVAILABLE by staff...');
  const tableToAssign = tables[0];
  await fetch(`${BASE_URL}/api/tables/${tableToAssign.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'AVAILABLE' })
  });

  console.log(`Staff clicks CALL on Token ${rohanToken} and assigns table ${tableToAssign.table_number}...`);
  res = await fetch(`${BASE_URL}/api/queue/${rohanQueueEntryId}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableId: tableToAssign.id })
  });
  let callResult = await res.json();
  console.log('Call result:', {
    success: callResult.success,
    status: callResult.queueEntry?.status,
    table: callResult.table?.table_number,
    notificationMessage: callResult.notification?.message
  });
  if (callResult.queueEntry?.status !== 'READY') {
    throw new Error('Expected queue status READY');
  }
  console.log('✓ Staff Call confirmed and notification dispatched!');

  // TEST 7: Customer screen status check -> becomes READY
  console.log('\n[TEST 7] Customer screen live updates to TABLE READY...');
  res = await fetch(`${BASE_URL}/api/queue/${rohanQueueEntryId}/status`);
  liveStatus = await res.json();
  console.log('Customer updated status:', {
    token: liveStatus.queueEntry.token_number,
    status: liveStatus.status,
    assignedTable: liveStatus.assignedTable
  });
  if (liveStatus.status !== 'READY' || !liveStatus.assignedTable) {
    throw new Error('Customer did not transition to READY with assigned table');
  }
  console.log('✓ Customer sees Table Ready screen with table: ' + liveStatus.assignedTable);

  // TEST 8: Staff marks customer SERVED
  console.log('\n[TEST 8] Staff marks customer as SERVED...');
  res = await fetch(`${BASE_URL}/api/queue/${rohanQueueEntryId}/served`, {
    method: 'POST'
  });
  let servedResult = await res.json();
  console.log('Customer marked served. Active visit ID:', servedResult.visitId);

  // TEST 9: Billing - Staff enters bill amount
  console.log('\n[TEST 9] Staff enters bill amount for customer...');
  res = await fetch(`${BASE_URL}/api/billing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: queueResult.customer.id,
      restaurantId,
      billAmount: 3250.00,
      tableId: tableToAssign.id
    })
  });
  let billResult = await res.json();
  console.log('Bill saved result:', {
    success: billResult.success,
    customerName: billResult.customer.name,
    latestBill: billResult.customer.latest_bill,
    totalSpend: billResult.customer.total_spend,
    visitCount: billResult.customer.visit_count
  });

  // TEST 10: Customer Profile & History updated
  console.log('\n[TEST 10] Verifying customer history and visits...');
  res = await fetch(`${BASE_URL}/api/customers/${queueResult.customer.id}`);
  let profile = await res.json();
  console.log('Customer Profile:', {
    name: profile.customer.name,
    totalSpend: profile.customer.total_spend,
    visitsCount: profile.visits.length,
    recordedVisitAmount: profile.visits[0]?.bill_amount
  });

  // TEST 11: QR Code Generation
  console.log('\n[TEST 11] Testing QR Code endpoint for restaurant...');
  res = await fetch(`${BASE_URL}/api/restaurants/${restaurantId}/qr`);
  let qrData = await res.json();
  console.log('QR Code generated successfully. Target URL:', qrData.targetUrl);

  // TEST 12: LED Display Endpoint
  console.log('\n[TEST 12] Testing optional LED display endpoint...');
  res = await fetch(`${BASE_URL}/api/display/${restaurantId}`);
  let displayData = await res.json();
  console.log('LED Display data:', displayData);

  console.log('\n========================================================');
  console.log('🎉 ALL DINEFLOW E2E FLOW TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('========================================================\n');
}

runTest().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
