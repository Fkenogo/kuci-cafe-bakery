import type { ItemServiceArea, ItemRating, ItemRatingAggregate, Review } from '../types';

export const ITEM_RATINGS_COLLECTION = 'itemRatings';
export const ITEM_RATING_AGGREGATES_COLLECTION = 'itemRatingAggregates';

export function normalizeItemServiceArea(value: unknown): ItemServiceArea {
  return value === 'bakery' ? 'bakery' : 'cafe';
}

export function buildItemRatingDocId(orderId: string, serviceArea: ItemServiceArea, itemId: string): string {
  return `${orderId}__${serviceArea}__${itemId}`;
}

export function buildItemRatingAggregateId(serviceArea: ItemServiceArea, itemId: string): string {
  return `${serviceArea}__${itemId}`;
}

export function getItemRatingSummary(averageRating?: number, ratingCount?: number): {
  hasRatings: boolean;
  averageLabel: string;
  countLabel: string;
  summaryLabel: string;
} {
  const count = typeof ratingCount === 'number' && ratingCount > 0 ? ratingCount : 0;
  const hasRatings = typeof averageRating === 'number' && Number.isFinite(averageRating) && count > 0;
  if (!hasRatings) {
    return {
      hasRatings: false,
      averageLabel: '0.0',
      countLabel: '0',
      summaryLabel: 'No ratings yet',
    };
  }

  return {
    hasRatings: true,
    averageLabel: averageRating.toFixed(1),
    countLabel: count.toString(),
    summaryLabel: `${averageRating.toFixed(1)} (${count})`,
  };
}

export function getItemRatingSummaryForItem(
  item: { averageRating?: number | null; ratingCount?: number | null } | null | undefined
): {
  hasRatings: boolean;
  averageLabel: string;
  countLabel: string;
  summaryLabel: string;
} {
  if (!item || typeof item !== 'object') {
    return getItemRatingSummary(undefined, 0);
  }

  return getItemRatingSummary(
    typeof item.averageRating === 'number' ? item.averageRating : undefined,
    typeof item.ratingCount === 'number' ? item.ratingCount : 0
  );
}

export function normalizeReview(value: unknown): Review | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const user = typeof record.user === 'string' ? record.user.trim() : '';
  const comment = typeof record.comment === 'string' ? record.comment.trim() : '';
  const date = typeof record.date === 'string' ? record.date.trim() : '';
  const rating = typeof record.rating === 'number' ? record.rating : NaN;

  if (!user || !date || !Number.isFinite(rating) || rating < 1 || rating > 5) {
    return null;
  }

  return {
    user,
    comment,
    date,
    rating,
  };
}

export function normalizeItemRatingAggregate(id: string, value: unknown): ItemRatingAggregate | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const itemId = typeof record.itemId === 'string' ? record.itemId.trim() : '';
  const ratingCount = typeof record.ratingCount === 'number' ? record.ratingCount : 0;
  const averageRating = typeof record.averageRating === 'number' ? record.averageRating : 0;

  if (!itemId || ratingCount < 0 || !Number.isFinite(averageRating)) {
    return null;
  }

  return {
    id,
    itemId,
    serviceArea: normalizeItemServiceArea(record.serviceArea),
    averageRating,
    ratingCount,
    reviews: Array.isArray(record.reviews)
      ? record.reviews.flatMap((review) => {
          const normalized = normalizeReview(review);
          return normalized ? [normalized] : [];
        })
      : [],
    updatedAt: record.updatedAt,
  };
}

export function getEmptyItemRatingAggregate(itemId = '', serviceArea: ItemServiceArea = 'cafe'): ItemRatingAggregate {
  return {
    id: itemId ? buildItemRatingAggregateId(serviceArea, itemId) : '',
    itemId,
    serviceArea,
    averageRating: 0,
    ratingCount: 0,
    reviews: [],
    updatedAt: null,
  };
}

export function normalizeItemRating(id: string, value: unknown): ItemRating | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const orderId = typeof record.orderId === 'string' ? record.orderId.trim() : '';
  const itemId = typeof record.itemId === 'string' ? record.itemId.trim() : '';
  const itemName = typeof record.itemName === 'string' ? record.itemName.trim() : '';
  const userId = typeof record.userId === 'string' ? record.userId.trim() : '';
  const customerDisplayName = typeof record.customerDisplayName === 'string' ? record.customerDisplayName.trim() : '';
  const stars = typeof record.stars === 'number' ? record.stars : NaN;

  if (!orderId || !itemId || !itemName || !userId || !customerDisplayName || !Number.isFinite(stars) || stars < 1 || stars > 5) {
    return null;
  }

  return {
    id,
    orderId,
    itemId,
    itemName,
    serviceArea: normalizeItemServiceArea(record.serviceArea),
    stars,
    comment: typeof record.comment === 'string' ? record.comment : '',
    customerDisplayName,
    userId,
    quantityPurchased: typeof record.quantityPurchased === 'number' ? record.quantityPurchased : undefined,
    businessDate: typeof record.businessDate === 'string' ? record.businessDate : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
