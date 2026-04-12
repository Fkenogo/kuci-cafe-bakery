import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();
const ITEM_RATINGS_COLLECTION = 'itemRatings';
const ITEM_RATING_AGGREGATES_COLLECTION = 'itemRatingAggregates';

type ServiceArea = 'cafe' | 'bakery';
type RatingRecord = {
  id: string;
  stars: number;
  customerDisplayName?: string;
  comment?: string;
  updatedAt?: unknown;
  createdAt?: unknown;
};

function buildAggregateDocId(serviceArea: ServiceArea, itemId: string): string {
  return `${serviceArea}__${itemId}`;
}

function formatReviewDate(value: unknown): string {
  if (value && typeof value === 'object' && typeof (value as admin.firestore.Timestamp).toDate === 'function') {
    return (value as admin.firestore.Timestamp).toDate().toLocaleDateString('en-GB');
  }
  return new Date().toLocaleDateString('en-GB');
}

async function refreshAggregateForItem(serviceArea: ServiceArea, itemId: string): Promise<void> {
  const ratingsSnapshot = await db
    .collection(ITEM_RATINGS_COLLECTION)
    .where('serviceArea', '==', serviceArea)
    .where('itemId', '==', itemId)
    .get();

  const aggregateRef = db.collection(ITEM_RATING_AGGREGATES_COLLECTION).doc(buildAggregateDocId(serviceArea, itemId));

  if (ratingsSnapshot.empty) {
    await aggregateRef.delete().catch(() => null);
    return;
  }

  const ratings: RatingRecord[] = ratingsSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as RatingRecord))
    .filter((entry) => typeof entry.stars === 'number' && entry.stars >= 1 && entry.stars <= 5);

  if (ratings.length === 0) {
    await aggregateRef.delete().catch(() => null);
    return;
  }

  const totalStars = ratings.reduce((sum, entry) => sum + entry.stars, 0);
  const ratingCount = ratings.length;
  const averageRating = Number((totalStars / ratingCount).toFixed(2));

  const reviews = ratings
    .filter((entry) => typeof entry.customerDisplayName === 'string' && entry.customerDisplayName.trim().length > 0)
    .sort((a, b) => {
      const aMs = a.updatedAt && typeof (a.updatedAt as admin.firestore.Timestamp).toMillis === 'function'
        ? (a.updatedAt as admin.firestore.Timestamp).toMillis()
        : 0;
      const bMs = b.updatedAt && typeof (b.updatedAt as admin.firestore.Timestamp).toMillis === 'function'
        ? (b.updatedAt as admin.firestore.Timestamp).toMillis()
        : 0;
      return bMs - aMs;
    })
    .slice(0, 5)
    .map((entry) => ({
      user: entry.customerDisplayName,
      rating: entry.stars,
      comment: typeof entry.comment === 'string' ? entry.comment : '',
      date: formatReviewDate(entry.updatedAt || entry.createdAt),
    }));

  await aggregateRef.set({
    itemId,
    serviceArea,
    averageRating,
    ratingCount,
    reviews,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

// Placeholder: log when a new order is created
export const onOrderCreated = onDocumentCreated('orders/{orderId}', (event) => {
  const orderData = event.data?.data();
  console.log('New order created:', event.params.orderId, orderData);
  return null;
});

// Placeholder: log when a menu item is updated
export const onMenuItemUpdated = onDocumentUpdated('menu/{itemId}', (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  console.log('Menu item updated:', event.params.itemId, { before, after });
  return null;
});

export const onItemRatingWritten = onDocumentWritten(`${ITEM_RATINGS_COLLECTION}/{ratingId}`, async (event) => {
  const before = event.data?.before.data() as { itemId?: string; serviceArea?: ServiceArea } | undefined;
  const after = event.data?.after.data() as { itemId?: string; serviceArea?: ServiceArea } | undefined;

  const targets = new Map<string, { itemId: string; serviceArea: ServiceArea }>();

  if (before?.itemId && (before.serviceArea === 'cafe' || before.serviceArea === 'bakery')) {
    targets.set(buildAggregateDocId(before.serviceArea, before.itemId), {
      itemId: before.itemId,
      serviceArea: before.serviceArea,
    });
  }

  if (after?.itemId && (after.serviceArea === 'cafe' || after.serviceArea === 'bakery')) {
    targets.set(buildAggregateDocId(after.serviceArea, after.itemId), {
      itemId: after.itemId,
      serviceArea: after.serviceArea,
    });
  }

  await Promise.all(
    Array.from(targets.values()).map((target) => refreshAggregateForItem(target.serviceArea, target.itemId))
  );
});
