import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardList, Printer, PlusCircle, UserCheck } from 'lucide-react';
import { db } from '../lib/firebase';
import { AppUserRecord, CartItem, HistoricalOrder, ItemCustomization, PersistedOrder, RestaurantSettings, UserProfile } from '../types';
import { OrdersView } from './OrdersView';
import { normalizePhoneForRewardKey } from '../lib/customerRewards';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function openReceiptWindow(order: PersistedOrder): void {
  const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
      return (v as { toDate: () => Date }).toDate();
    }
    return null;
  };
  const fmt = (d: Date | null) =>
    d ? d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '\u2014';

  const orderId = esc((order.id || '').slice(-8).toUpperCase());
  const customerName = esc(order.customer?.name || order.assistedCustomerName || 'N/A');
  const customerPhone = esc(order.customer?.phone || order.assistedCustomerPhoneNormalized || '');
  const createdAt = esc(fmt(toDate(order.createdAt)));
  const updatedAt = esc(fmt(toDate(order.updatedAt)));
  const sourceLabel = esc((order.orderSource || 'walk_in').replace(/_/g, ' '));
  const modeLabel = esc((order.serviceMode || 'pickup').replace(/_/g, ' '));
  const payLabel = esc(
    order.checkoutPaymentChoice === 'mobile_money'
      ? 'Mobile Money'
      : (order.checkoutPaymentChoice || 'Cash').replace(/_/g, ' ')
  );
  const staffName = esc(order.createdByStaffName || order.completedBy?.displayName || '\u2014');

  const itemRows = (order.items || []).map((item) => {
    const options = item.selectedOptions?.length
      ? `<br/><span style="font-size:11px;color:#666">${item.selectedOptions.map(esc).join(', ')}</span>`
      : '';
    return `<tr>
      <td style="padding:6px 4px;border-bottom:1px solid #eee">${esc(item.itemName)}${options}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">${(item.unitPrice || 0).toLocaleString()}</td>
      <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">${(item.lineTotal || 0).toLocaleString()}</td>
    </tr>`;
  }).join('');

  const deliveryRow = (order.deliveryFee || 0) > 0
    ? `<tr><td>Subtotal</td><td>${(order.subtotal || 0).toLocaleString()} RWF</td></tr>` +
      `<tr><td>Delivery</td><td>${(order.deliveryFee || 0).toLocaleString()} RWF</td></tr>`
    : '';

  const completedRow = order.status === 'completed'
    ? `<p class="meta">Completed: <strong>${updatedAt}</strong></p>`
    : '';

  const phoneRow = customerPhone
    ? `<p class="meta">Phone: <strong>${customerPhone}</strong></p>`
    : '';

  const css = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:24px;max-width:420px;margin:auto}',
    '.brand{text-align:center;margin-bottom:20px}',
    '.brand h1{font-size:20px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}',
    '.brand p{font-size:11px;color:#666;margin-top:2px}',
    '.divider{border:none;border-top:1px dashed #ccc;margin:14px 0}',
    '.meta{font-size:11px;color:#555;margin-bottom:4px}',
    '.meta strong{color:#111}',
    'table{width:100%;border-collapse:collapse;margin:12px 0}',
    'th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888;padding:4px 4px 8px;border-bottom:2px solid #111}',
    'th:nth-child(2){text-align:center}th:nth-child(3),th:nth-child(4){text-align:right}',
    '.totals{margin-top:8px;font-size:12px}',
    '.totals tr td:first-child{color:#555}',
    '.totals tr td:last-child{text-align:right;font-weight:700}',
    '.total-row td{font-size:15px;font-weight:900;padding-top:8px;border-top:2px solid #111}',
    '.footer{text-align:center;margin-top:24px;font-size:10px;color:#999;line-height:1.6}',
    '@media print{body{padding:8px}}',
  ].join('');

  const parts = [
    '<!DOCTYPE html><html lang="en"><head>',
    '<meta charset="UTF-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
    `<title>KUCI Receipt #${orderId}</title>`,
    `<style>${css}</style>`,
    '</head><body>',
    '<div class="brand"><h1>KUCI</h1><p>Cafe &amp; Bakery</p></div>',
    '<hr class="divider"/>',
    `<p class="meta">Order: <strong>#${orderId}</strong></p>`,
    `<p class="meta">Date: <strong>${createdAt}</strong></p>`,
    `<p class="meta">Customer: <strong>${customerName}</strong></p>`,
    phoneRow,
    `<p class="meta">Source: <strong>${sourceLabel}</strong></p>`,
    `<p class="meta">Service: <strong>${modeLabel}</strong></p>`,
    `<p class="meta">Payment: <strong>${payLabel}</strong></p>`,
    `<p class="meta">Created by: <strong>${staffName}</strong></p>`,
    completedRow,
    '<hr class="divider"/>',
    '<table><thead><tr>',
    '<th>Item</th><th>Qty</th><th>Unit (RWF)</th><th>Total (RWF)</th>',
    `</tr></thead><tbody>${itemRows}</tbody></table>`,
    '<hr class="divider"/>',
    `<table class="totals"><tbody>${deliveryRow}`,
    `<tr class="total-row"><td>TOTAL</td><td>${(order.total || 0).toLocaleString()} RWF</td></tr>`,
    '</tbody></table>',
    '<hr class="divider"/>',
    '<div class="footer"><p>Thank you for choosing KUCI Cafe &amp; Bakery!</p><p>Staff-generated receipt</p></div>',
    '</body></html>',
  ];

  const blob = new Blob([parts.join('')], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=480,height=700');
  if (win) {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

interface StaffOrderEntryViewProps {
  cart: CartItem[];
  updateQuantity: (id: string, delta: number) => void;
  clearCart: () => void;
  loyaltyPoints: number;
  orderHistory: HistoricalOrder[];
  guestOrderRefs: string[];
  onReorder: (items: CartItem[]) => void;
  onUpdateCustomization: (instanceId: string, customization: ItemCustomization) => void;
  settings: RestaurantSettings | null;
  userId?: string | null;
  currentStaff: AppUserRecord | null;
  assistedCustomerProfile: UserProfile;
  setAssistedCustomerProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  onOrderComplete: (order: HistoricalOrder, options?: { trackInLocalHistory?: boolean }) => void;
  onExitToOperational: () => void;
  onOpenCafeMenu: () => void;
  onOpenBakeryMenu: () => void;
}

export const StaffOrderEntryView: React.FC<StaffOrderEntryViewProps> = ({
  cart,
  updateQuantity,
  clearCart,
  loyaltyPoints,
  orderHistory,
  guestOrderRefs,
  onReorder,
  onUpdateCustomization,
  settings,
  userId,
  currentStaff,
  assistedCustomerProfile,
  setAssistedCustomerProfile,
  onOrderComplete,
  onExitToOperational,
  onOpenCafeMenu,
  onOpenBakeryMenu,
}) => {
  const [orderSource, setOrderSource] = useState<'walk_in' | 'phone_call' | 'whatsapp' | 'other'>('walk_in');
  const [showValidation, setShowValidation] = useState(false);
  const [orderBuildStarted, setOrderBuildStarted] = useState(() => cart.length > 0);
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');

  // History state
  const [historyOrders, setHistoryOrders] = useState<PersistedOrder[]>([]);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'open' | 'completed' | 'cancelled'>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<'today' | 'yesterday' | 'last7' | 'custom'>('today');
  const [historySourceFilter, setHistorySourceFilter] = useState<'all' | 'walk_in' | 'phone_call' | 'whatsapp' | 'other'>('all');
  const [historyLaneFilter, setHistoryLaneFilter] = useState<'all' | 'cafe' | 'bakery'>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyVisibleCount, setHistoryVisibleCount] = useState(15);

  const trimmedName = assistedCustomerProfile.name.trim();
  const normalizedPhone = normalizePhoneForRewardKey(assistedCustomerProfile.phone);
  const hasName = trimmedName.length > 0;
  const hasPhone = normalizedPhone.length >= 10;
  const hasIdentity = hasName || hasPhone;
  const canProceed = hasIdentity;

  const staffIdentity = useMemo(() => {
    if (!currentStaff) return null;
    if (currentStaff.role !== 'admin' && currentStaff.role !== 'front_service' && currentStaff.role !== 'bakery_front_service') {
      return null;
    }
    return {
      uid: currentStaff.uid,
      role: currentStaff.role,
      displayName: currentStaff.displayName,
    };
  }, [currentStaff]);

  useEffect(() => {
    if (!staffIdentity) {
      setHistoryOrders([]);
      return;
    }
    const q = query(
      collection(db, 'orders'),
      where('createdByStaffUid', '==', staffIdentity.uid),
      limit(200)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const parsed = snapshot.docs.map((d) => ({ ...(d.data() as PersistedOrder), id: d.id }));
      parsed.sort((a, b) => {
        const aMs = a.createdAt && typeof (a.createdAt as { toDate?: () => Date }).toDate === 'function'
          ? (a.createdAt as { toDate: () => Date }).toDate().getTime() : 0;
        const bMs = b.createdAt && typeof (b.createdAt as { toDate?: () => Date }).toDate === 'function'
          ? (b.createdAt as { toDate: () => Date }).toDate().getTime() : 0;
        return bMs - aMs;
      });
      setHistoryOrders(parsed);
    });
    return () => unsubscribe();
  }, [staffIdentity]);

  const filteredHistoryOrders = useMemo(() => {
    let next = historyOrders;
    if (historyStatusFilter !== 'all') {
      if (historyStatusFilter === 'open') {
        next = next.filter((o) => o.status === 'pending' || o.status === 'front_accepted' || o.status === 'in_progress' || o.status === 'ready_for_handover');
      } else if (historyStatusFilter === 'completed') {
        next = next.filter((o) => o.status === 'completed');
      } else {
        next = next.filter((o) => o.status === 'rejected');
      }
    }
    if (historyLaneFilter !== 'all') {
      next = next.filter((o) => historyLaneFilter === 'bakery' ? o.frontLane === 'bakery_front' : o.frontLane !== 'bakery_front');
    }
    if (historySourceFilter !== 'all') {
      next = next.filter((o) => (o.orderSource || 'walk_in') === historySourceFilter);
    }
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfLast7 = new Date(startOfToday);
    startOfLast7.setDate(startOfLast7.getDate() - 6);
    const getCreatedAt = (o: PersistedOrder) =>
      o.createdAt && typeof (o.createdAt as { toDate?: () => Date }).toDate === 'function'
        ? (o.createdAt as { toDate: () => Date }).toDate()
        : null;
    if (historyDateFilter === 'today') {
      next = next.filter((o) => { const d = getCreatedAt(o); return !!d && d >= startOfToday; });
    } else if (historyDateFilter === 'yesterday') {
      next = next.filter((o) => { const d = getCreatedAt(o); return !!d && d >= startOfYesterday && d < startOfToday; });
    } else if (historyDateFilter === 'last7') {
      next = next.filter((o) => { const d = getCreatedAt(o); return !!d && d >= startOfLast7; });
    } else if (historyDateFilter === 'custom' && (historyDateFrom || historyDateTo)) {
      const from = historyDateFrom ? new Date(`${historyDateFrom}T00:00:00`) : null;
      const to = historyDateTo ? new Date(`${historyDateTo}T23:59:59`) : null;
      next = next.filter((o) => {
        const d = getCreatedAt(o);
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    return next;
  }, [historyOrders, historyStatusFilter, historyLaneFilter, historySourceFilter, historyDateFilter, historyDateFrom, historyDateTo]);

  if (!staffIdentity) {
    return (
      <div className="px-4 py-8">
        <section className="rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 space-y-2">
          <h2 className="text-base font-black uppercase tracking-widest text-red-700">Staff order entry unavailable</h2>
          <p className="text-sm text-red-700">Only admin, front service, and bakery front service can create assisted orders.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab toggle + back button */}
      <div className="mx-4 mt-6 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-1">
          <button
            onClick={() => setActiveTab('create')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
              activeTab === 'create' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'
            }`}
          >
            <PlusCircle className="w-3 h-3" />
            Create Order
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
              activeTab === 'history' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'
            }`}
          >
            <ClipboardList className="w-3 h-3" />
            My Orders
            {historyOrders.length > 0 && (
              <span className={`${activeTab === 'history' ? 'bg-white/25' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'} px-1.5 py-0.5 rounded-full text-[9px]`}>
                {historyOrders.length}
              </span>
            )}
          </button>
        </div>
        <button
          onClick={onExitToOperational}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider"
        >
          <ArrowLeft className="w-3 h-3" />
          Back
        </button>
      </div>

      {/* History tab */}
      {activeTab === 'history' && (
        <div className="px-4 pb-28 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[var(--color-primary)]" />
              <h2 className="text-sm font-black uppercase tracking-widest text-[var(--color-text-muted)]">My Assisted Orders</h2>
            </div>
            <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">
              {filteredHistoryOrders.length} shown · {historyOrders.length} total
            </span>
          </div>

          {/* Status filter */}
          <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
            {([
              { id: 'all' as const, label: 'All' },
              { id: 'open' as const, label: 'Open' },
              { id: 'completed' as const, label: 'Done' },
              { id: 'cancelled' as const, label: 'Cancelled' },
            ]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setHistoryStatusFilter(opt.id)}
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                  historyStatusFilter === opt.id ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Secondary filters */}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Date</span>
              <select
                value={historyDateFilter}
                onChange={(e) => setHistoryDateFilter(e.target.value as typeof historyDateFilter)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7">Last 7 days</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Lane</span>
              <select
                value={historyLaneFilter}
                onChange={(e) => setHistoryLaneFilter(e.target.value as typeof historyLaneFilter)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="all">All lanes</option>
                <option value="cafe">Cafe lane</option>
                <option value="bakery">Bakery lane</option>
              </select>
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Source</span>
              <select
                value={historySourceFilter}
                onChange={(e) => setHistorySourceFilter(e.target.value as typeof historySourceFilter)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold"
              >
                <option value="all">All sources</option>
                <option value="walk_in">Walk-in</option>
                <option value="phone_call">Phone Call</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          {historyDateFilter === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">From</span>
                <input type="date" value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">To</span>
                <input type="date" value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)} className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold" />
              </label>
            </div>
          )}

          {/* Orders list */}
          {filteredHistoryOrders.length === 0 ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">
              No assisted orders in this filter.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHistoryOrders.slice(0, historyVisibleCount).map((order) => {
                const createdAtDate = order.createdAt && typeof (order.createdAt as { toDate?: () => Date }).toDate === 'function'
                  ? (order.createdAt as { toDate: () => Date }).toDate()
                  : null;
                const createdAtLabel = createdAtDate
                  ? createdAtDate.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
                  : '—';
                const sourceLabel = (order.orderSource || 'walk_in').replace('_', ' ');
                const laneLabel = order.frontLane === 'bakery_front' ? 'bakery lane' : 'cafe lane';
                const statusLabel = (order.status || 'pending').replaceAll('_', ' ');
                const serviceModeLabel = order.serviceMode === 'dine_in' ? 'dine in' : order.serviceMode || 'pickup';
                const payLabel = order.checkoutPaymentChoice === 'mobile_money' ? 'mobile money' : (order.checkoutPaymentChoice || 'cash');
                return (
                  <article key={order.id} className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Order #{(order.id || '').slice(-6)}</p>
                        <p className="text-sm font-semibold">{order.customer?.name || order.assistedCustomerName || 'Unnamed customer'}</p>
                        {order.customer?.phone && <p className="text-xs text-[var(--color-text-muted)]">{order.customer.phone}</p>}
                        {order.createdByStaffName && (
                          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--color-primary)]/70 mt-0.5">
                            Assisted by {order.createdByStaffName}
                          </p>
                        )}
                      </div>
                      <p className="text-sm font-black text-[var(--color-primary)] shrink-0">{(order.total || 0).toLocaleString()} RWF</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wider font-black">
                      <span className="rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-0.5">{sourceLabel}</span>
                      <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-0.5">{statusLabel}</span>
                      <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-0.5">{laneLabel}</span>
                      <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-0.5">{serviceModeLabel}</span>
                      <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-0.5">pay: {payLabel}</span>
                      <span className="rounded-full bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[var(--color-text-muted)]">{createdAtLabel}</span>
                    </div>
                    {order.status === 'completed' && (
                      <button
                        onClick={() => openReceiptWindow(order)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
                      >
                        <Printer className="w-3 h-3" />
                        Receipt
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {filteredHistoryOrders.length > historyVisibleCount && (
            <div className="flex justify-center">
              <button
                onClick={() => setHistoryVisibleCount((prev) => prev + 15)}
                className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-xs font-black uppercase tracking-wider hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create tab */}
      {activeTab === 'create' && (<>
      <section className="mx-4 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-[var(--color-primary)]" />
          <h2 className="text-sm font-black uppercase tracking-widest text-[var(--color-text-muted)]">Staff Assisted Order</h2>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Customer Name</label>
          <input
            type="text"
            value={assistedCustomerProfile.name}
            onChange={(event) => setAssistedCustomerProfile((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Customer name"
            className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Telephone Number</label>
          <input
            type="tel"
            value={assistedCustomerProfile.phone}
            onChange={(event) => setAssistedCustomerProfile((prev) => ({ ...prev, phone: event.target.value }))}
            placeholder="07..."
            className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)]">Order Source</label>
          <select
            value={orderSource}
            onChange={(event) => setOrderSource(event.target.value as 'walk_in' | 'phone_call' | 'whatsapp' | 'other')}
            className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm"
          >
            <option value="walk_in">Walk-in</option>
            <option value="phone_call">Phone Call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="other">Other</option>
          </select>
        </div>

        {showValidation && !hasIdentity && (
          <p className="text-[11px] text-red-700 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Enter at least customer name or phone number before continuing.
          </p>
        )}
        {!hasPhone && hasName && (
          <p className="text-[11px] text-amber-700 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            Phone missing: loyalty tracking will be skipped for this order.
          </p>
        )}

        <button
          onClick={() => {
            setShowValidation(true);
            if (canProceed) setOrderBuildStarted(true);
          }}
          disabled={!canProceed}
          className={`w-full rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 ${
            canProceed
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
          }`}
        >
          Continue to Menu
          {canProceed && <CheckCircle2 className="w-4 h-4" />}
        </button>
      </section>

      {orderBuildStarted && (
        <section className="mx-4 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-4 space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-[var(--color-text-muted)]">Build Order</h3>
          <p className="text-sm text-[var(--color-text-muted)]">Add items first, then complete checkout below.</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onOpenCafeMenu}
              className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-xs font-black uppercase tracking-wider"
            >
              Open Cafe Menu
            </button>
            <button
              onClick={onOpenBakeryMenu}
              className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-xs font-black uppercase tracking-wider"
            >
              Open Bakery Menu
            </button>
          </div>
        </section>
      )}

      {orderBuildStarted && (
        <OrdersView
          cart={cart}
          updateQuantity={updateQuantity}
          removeFromCart={(id) => updateQuantity(id, -1)}
          clearCart={clearCart}
          loyaltyPoints={loyaltyPoints}
          userProfile={assistedCustomerProfile}
          setUserProfile={setAssistedCustomerProfile}
          onOrderComplete={onOrderComplete}
          orderHistory={orderHistory}
          guestOrderRefs={guestOrderRefs}
          onReorder={onReorder}
          onUpdateCustomization={onUpdateCustomization}
          settings={settings}
          userId={userId}
          orderEntryContext={{
            defaultMode: 'staff_assisted',
            canUseStaffAssistedEntry: false,
            staffIdentity,
            onExitToOperational,
          }}
          hideIdentityCapture
          hidePersonalOrderWidgets
          lockedStaffOrderSource={orderSource}
        />
      )}
      </>)}
    </div>
  );
};
