import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Example function to handle order creation
export const onOrderCreated = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snapshot, context) => {
    const orderData = snapshot.data();
    console.log('New order created:', context.params.orderId, orderData);
    
    // You could send a notification, email, or update other documents here
    return null;
  });

// Example function to handle menu item updates
export const onMenuItemUpdated = functions.firestore
  .document('menuItems/{itemId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    console.log('Menu item updated:', context.params.itemId, { before, after });
    
    return null;
  });
