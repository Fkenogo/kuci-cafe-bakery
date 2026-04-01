import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Placeholder: log when a new order is created
export const onOrderCreated = onDocumentCreated('orders/{orderId}', (event) => {
  const orderData = event.data?.data();
  console.log('New order created:', event.params.orderId, orderData);
  return null;
});

// Placeholder: log when a menu item is updated
export const onMenuItemUpdated = onDocumentUpdated('menuItems/{itemId}', (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  console.log('Menu item updated:', event.params.itemId, { before, after });
  return null;
});
