/**
 * Единая логика создания DeliveryOrder (публичный сайт + CRM manual).
 * Сумма и состав позиций — только через computeQuoteKopeks (pricing.js).
 */

import { computeQuoteKopeks } from './pricing.js';

export const DELIVERY_ORDER_STATUSES = [
  'NEW',
  'CONFIRMED',
  'KITCHEN',
  'DELIVERING',
  'DONE',
  'CANCELED'
];

export const SOURCE_CHANNELS = ['SITE', 'VK', 'MANUAL', 'PHONE'];

const STATUS_SET = new Set(DELIVERY_ORDER_STATUSES);
const CHANNEL_SET = new Set(SOURCE_CHANNELS);

/** Простые допустимые переходы (линейный поток + отмена). */
const TRANSITIONS = {
  NEW: new Set(['CONFIRMED', 'CANCELED']),
  CONFIRMED: new Set(['KITCHEN', 'CANCELED']),
  KITCHEN: new Set(['DELIVERING', 'CANCELED']),
  DELIVERING: new Set(['DONE', 'CANCELED']),
  DONE: new Set([]),
  CANCELED: new Set([])
};

export function normalizePhone(raw) {
  let d = String(raw || '')
    .replace(/\D/g, '')
    .replace(/^8/, '7');
  if (!d.startsWith('7')) d = '7' + d;
  return d.slice(0, 11);
}

export function isAllowedStatus(s) {
  return STATUS_SET.has(String(s || '').trim());
}

export function isAllowedSourceChannel(s) {
  return CHANNEL_SET.has(String(s || '').trim());
}

/**
 * @param {string} from
 * @param {string} to
 */
export function isAllowedStatusTransition(from, to) {
  const f = String(from || '').trim();
  const t = String(to || '').trim();
  if (!STATUS_SET.has(f) || !STATUS_SET.has(t)) return false;
  if (f === t) return true;
  const next = TRANSITIONS[f];
  return next ? next.has(t) : false;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   branchId: string,
 *   deliveryDate: string,
 *   customerName: string,
 *   customerPhone: string,
 *   items: Array<{ position: number, qty: number }>,
 *   address?: string | null,
 *   comment?: string | null,
 *   paymentType?: string | null,
 *   attributionJson?: string | null,
 *   status?: string,
 *   sourceChannel?: string,
 *   linkVkLeadId?: string | null,
 *   linkCompanyAccountId?: string | null
 * }} input
 */
export async function createDeliveryOrderFromInput(prisma, input) {
  const {
    branchId,
    deliveryDate,
    customerName,
    customerPhone,
    items,
    address = null,
    comment = null,
    paymentType = null,
    attributionJson = null,
    status = 'NEW',
    sourceChannel = 'SITE',
    linkVkLeadId = null,
    linkCompanyAccountId = null
  } = input;

  if (!branchId || !deliveryDate) {
    const e = new Error('branchId и deliveryDate обязательны');
    e.code = 'VALIDATION';
    throw e;
  }
  if (!customerName || !String(customerName).trim()) {
    const e = new Error('customerName обязателен');
    e.code = 'VALIDATION';
    throw e;
  }
  const phone = normalizePhone(customerPhone);
  if (phone.length < 11) {
    const e = new Error('Некорректный телефон');
    e.code = 'VALIDATION';
    throw e;
  }
  if (!Array.isArray(items) || items.length === 0) {
    const e = new Error('items не может быть пустым');
    e.code = 'VALIDATION';
    throw e;
  }

  const st = String(status || 'NEW').trim();
  const ch = String(sourceChannel || 'SITE').trim();
  if (!isAllowedStatus(st)) {
    const e = new Error(`Недопустимый status: ${st}`);
    e.code = 'VALIDATION';
    throw e;
  }
  if (!isAllowedSourceChannel(ch)) {
    const e = new Error(`Недопустимый sourceChannel: ${ch}`);
    e.code = 'VALIDATION';
    throw e;
  }

  let quote;
  try {
    quote = await computeQuoteKopeks(prisma, branchId, deliveryDate, items);
  } catch (err) {
    const e = new Error(err.message || 'Некорректный состав заказа');
    e.code = 'ORDER_ITEMS';
    throw e;
  }

  const totalAmount = quote.totalAmount;

  const createData = {
    branchId: String(branchId),
    deliveryDate: String(deliveryDate),
    customerName: String(customerName).trim().slice(0, 200),
    customerPhone: phone,
    address: address != null ? String(address).trim().slice(0, 500) || null : null,
    comment: comment != null ? String(comment).trim().slice(0, 2000) || null : null,
    paymentType: paymentType != null ? String(paymentType).trim().slice(0, 32) || null : null,
    totalAmount,
    attributionJson: attributionJson != null ? attributionJson : null,
    status: st,
    sourceChannel: ch,
    items: {
      create: items.map((line) => ({
        position: Number(line.position),
        qty: Number(line.qty)
      }))
    }
  };

  if (linkCompanyAccountId) {
    const caId = String(linkCompanyAccountId).trim();
    const acc = await prisma.companyAccount.findUnique({ where: { id: caId } });
    if (!acc) {
      const e = new Error('Компания не найдена');
      e.code = 'NOT_FOUND';
      throw e;
    }
    createData.companyAccountId = caId;
  }

  if (linkVkLeadId) {
    const leadId = String(linkVkLeadId).trim();
    const lead = await prisma.vkLead.findUnique({ where: { id: leadId } });
    if (!lead) {
      const e = new Error('VkLead не найден');
      e.code = 'NOT_FOUND';
      throw e;
    }
    if (lead.convertedOrderId) {
      const e = new Error('Лид уже связан с заказом');
      e.code = 'CONFLICT';
      throw e;
    }
    const order = await prisma.$transaction(async (tx) => {
      const o = await tx.deliveryOrder.create({
        data: { ...createData, sourceChannel: 'VK' },
        include: { branch: true, items: true }
      });
      await tx.vkLead.update({
        where: { id: leadId },
        data: {
          convertedOrderId: o.id,
          status: 'CONVERTED'
        }
      });
      return o;
    });
    return order;
  }

  const order = await prisma.deliveryOrder.create({
    data: createData,
    include: { branch: true, items: true }
  });
  return order;
}
