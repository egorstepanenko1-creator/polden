/**
 * B2B: корпоративные заявки и компании (без биллинга и договоров).
 */

import { normalizePhone, isAllowedSourceChannel } from './deliveryOrderService.js';
import {
  isCorporateLeadStatus,
  isCompanyAccountStatus,
  CORPORATE_LEAD_STATUSES,
  COMPANY_ACCOUNT_STATUSES
} from './corporateB2bConstants.js';

/**
 * @param {import('@prisma/client').CorporateLead & { companyAccount?: { id: string, companyName: string, status: string } | null }} row
 */
export function serializeCorporateLead(row) {
  return {
    id: row.id,
    companyAccountId: row.companyAccountId,
    companyAccount: row.companyAccount
      ? { id: row.companyAccount.id, companyName: row.companyAccount.companyName, status: row.companyAccount.status }
      : null,
    contactName: row.contactName,
    phone: row.phone,
    companyName: row.companyName,
    city: row.city,
    address: row.address,
    headcountEstimate: row.headcountEstimate,
    preferredDeliveryTime: row.preferredDeliveryTime,
    comment: row.comment,
    sourceChannel: row.sourceChannel,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/**
 * @param {import('@prisma/client').CompanyAccount & { contacts?: import('@prisma/client').CompanyContact[], defaultBranch?: { id: string, name: string } | null }} row
 */
export function serializeCompanyAccount(row) {
  return {
    id: row.id,
    companyName: row.companyName,
    city: row.city,
    address: row.address,
    notes: row.notes,
    status: row.status,
    defaultBranchId: row.defaultBranchId,
    defaultBranch: row.defaultBranch ? { id: row.defaultBranch.id, name: row.defaultBranch.name } : null,
    contacts: Array.isArray(row.contacts)
      ? row.contacts.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          roleTitle: c.roleTitle,
          preferredContactMethod: c.preferredContactMethod,
          createdAt: c.createdAt.toISOString()
        }))
      : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ status?: string, city?: string, q?: string }} query
 */
export async function listCorporateLeads(prisma, query) {
  /** @type {import('@prisma/client').Prisma.CorporateLeadWhereInput} */
  const where = {};
  if (query.status && isCorporateLeadStatus(query.status)) {
    where.status = String(query.status).trim();
  }
  if (query.city && String(query.city).trim()) {
    where.city = { contains: String(query.city).trim() };
  }
  const q = String(query.q || '').trim();
  if (q.length >= 2) {
    where.OR = [
      { companyName: { contains: q } },
      { contactName: { contains: q } },
      { phone: { contains: q } }
    ];
  }
  const [rows, groupCounts, companyGroupCounts] = await Promise.all([
    prisma.corporateLead.findMany({
      where,
      include: {
        companyAccount: { select: { id: true, companyName: true, status: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    }),
    prisma.corporateLead.groupBy({
      by: ['status'],
      _count: { _all: true }
    }),
    prisma.companyAccount.groupBy({
      by: ['status'],
      _count: { _all: true }
    })
  ]);
  /** @type {Record<string, number>} */
  const leadCountsByStatus = {};
  for (const s of CORPORATE_LEAD_STATUSES) leadCountsByStatus[s] = 0;
  for (const g of groupCounts) {
    leadCountsByStatus[g.status] = g._count._all;
  }
  /** @type {Record<string, number>} */
  const companyCountsByStatus = {};
  for (const s of COMPANY_ACCOUNT_STATUSES) companyCountsByStatus[s] = 0;
  for (const g of companyGroupCounts) {
    companyCountsByStatus[g.status] = g._count._all;
  }
  return {
    items: rows.map(serializeCorporateLead),
    leadCountsByStatus,
    companyCountsByStatus
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ status?: string, q?: string }} query
 */
export async function listCompanyAccounts(prisma, query) {
  /** @type {import('@prisma/client').Prisma.CompanyAccountWhereInput} */
  const where = {};
  if (query.status && isCompanyAccountStatus(query.status)) {
    where.status = String(query.status).trim();
  }
  const q = String(query.q || '').trim();
  if (q.length >= 2) {
    where.OR = [
      { companyName: { contains: q } },
      { city: { contains: q } },
      { address: { contains: q } }
    ];
  }
  const rows = await prisma.companyAccount.findMany({
    where,
    include: {
      contacts: { orderBy: { createdAt: 'asc' } },
      defaultBranch: { select: { id: true, name: true } }
    },
    orderBy: { updatedAt: 'desc' },
    take: 500
  });
  return { items: rows.map(serializeCompanyAccount) };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Record<string, unknown>} body
 */
export async function createCorporateLeadCrm(prisma, body) {
  const companyName = String(body.companyName ?? '').trim();
  const contactName = String(body.contactName ?? '').trim();
  const city = String(body.city ?? '').trim();
  const address = String(body.address ?? '').trim();
  const phone = normalizePhone(body.phone);
  if (!companyName || !contactName || !city || !address) {
    const e = new Error('companyName, contactName, city, address обязательны');
    e.code = 'VALIDATION';
    throw e;
  }
  if (phone.length < 11) {
    const e = new Error('Некорректный телефон');
    e.code = 'VALIDATION';
    throw e;
  }
  const ch = body.sourceChannel != null ? String(body.sourceChannel).trim() : 'MANUAL';
  if (!isAllowedSourceChannel(ch)) {
    const e = new Error(`Недопустимый sourceChannel: ${ch}`);
    e.code = 'VALIDATION';
    throw e;
  }
  const st = body.status != null ? String(body.status).trim() : 'NEW';
  if (!isCorporateLeadStatus(st)) {
    const e = new Error(`Недопустимый status: ${st}`);
    e.code = 'VALIDATION';
    throw e;
  }
  let headcountEstimate = null;
  if (body.headcountEstimate != null && body.headcountEstimate !== '') {
    const n = Number(body.headcountEstimate);
    if (!Number.isFinite(n) || n < 0 || n > 50000) {
      const e = new Error('headcountEstimate некорректен');
      e.code = 'VALIDATION';
      throw e;
    }
    headcountEstimate = Math.floor(n);
  }
  const row = await prisma.corporateLead.create({
    data: {
      contactName: contactName.slice(0, 120),
      phone,
      companyName: companyName.slice(0, 200),
      city: city.slice(0, 120),
      address: address.slice(0, 500),
      headcountEstimate,
      preferredDeliveryTime:
        body.preferredDeliveryTime != null
          ? String(body.preferredDeliveryTime).trim().slice(0, 120) || null
          : null,
      comment: body.comment != null ? String(body.comment).trim().slice(0, 2000) || null : null,
      sourceChannel: ch,
      status: st
    },
    include: { companyAccount: { select: { id: true, companyName: true, status: true } } }
  });
  return serializeCorporateLead(row);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Record<string, unknown>} body — публичная заявка (после guard)
 */
export async function createCorporateLeadPublic(prisma, body) {
  const companyName = String(body.companyName ?? '').trim();
  const contactName = String(body.contactName ?? '').trim();
  const city = String(body.city ?? '').trim();
  const address = String(body.address ?? '').trim();
  const phone = normalizePhone(body.phone);
  if (!companyName || !contactName || !city || !address) {
    const e = new Error('Заполните компанию, контакт, город и адрес');
    e.code = 'VALIDATION';
    throw e;
  }
  if (phone.length < 11) {
    const e = new Error('Укажите корректный телефон');
    e.code = 'VALIDATION';
    throw e;
  }
  let headcountEstimate = null;
  if (body.headcountEstimate != null && body.headcountEstimate !== '') {
    const n = Number(body.headcountEstimate);
    if (Number.isFinite(n) && n >= 0 && n <= 50000) headcountEstimate = Math.floor(n);
  }
  const row = await prisma.corporateLead.create({
    data: {
      contactName: contactName.slice(0, 120),
      phone,
      companyName: companyName.slice(0, 200),
      city: city.slice(0, 120),
      address: address.slice(0, 500),
      headcountEstimate,
      preferredDeliveryTime:
        body.preferredDeliveryTime != null
          ? String(body.preferredDeliveryTime).trim().slice(0, 120) || null
          : null,
      comment: body.comment != null ? String(body.comment).trim().slice(0, 2000) || null : null,
      sourceChannel: 'SITE',
      status: 'NEW'
    },
    include: { companyAccount: { select: { id: true, companyName: true, status: true } } }
  });
  return serializeCorporateLead(row);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} id
 * @param {Record<string, unknown>} body
 */
export async function patchCorporateLead(prisma, id, body) {
  const lead = await prisma.corporateLead.findUnique({ where: { id } });
  if (!lead) {
    const e = new Error('Лид не найден');
    e.code = 'NOT_FOUND';
    throw e;
  }
  /** @type {import('@prisma/client').Prisma.CorporateLeadUpdateInput} */
  const data = {};
  if (body.contactName != null) data.contactName = String(body.contactName).trim().slice(0, 120);
  if (body.phone != null) {
    const p = normalizePhone(body.phone);
    if (p.length < 11) {
      const e = new Error('Некорректный телефон');
      e.code = 'VALIDATION';
      throw e;
    }
    data.phone = p;
  }
  if (body.companyName != null) data.companyName = String(body.companyName).trim().slice(0, 200);
  if (body.city != null) data.city = String(body.city).trim().slice(0, 120);
  if (body.address != null) data.address = String(body.address).trim().slice(0, 500);
  if (body.preferredDeliveryTime !== undefined) {
    data.preferredDeliveryTime =
      body.preferredDeliveryTime != null
        ? String(body.preferredDeliveryTime).trim().slice(0, 120) || null
        : null;
  }
  if (body.comment !== undefined) {
    data.comment = body.comment != null ? String(body.comment).trim().slice(0, 2000) || null : null;
  }
  if (body.headcountEstimate !== undefined) {
    if (body.headcountEstimate == null || body.headcountEstimate === '') data.headcountEstimate = null;
    else {
      const n = Number(body.headcountEstimate);
      if (!Number.isFinite(n) || n < 0 || n > 50000) {
        const e = new Error('headcountEstimate некорректен');
        e.code = 'VALIDATION';
        throw e;
      }
      data.headcountEstimate = Math.floor(n);
    }
  }
  if (body.sourceChannel != null) {
    const ch = String(body.sourceChannel).trim();
    if (!isAllowedSourceChannel(ch)) {
      const e = new Error(`Недопустимый sourceChannel: ${ch}`);
      e.code = 'VALIDATION';
      throw e;
    }
    data.sourceChannel = ch;
  }
  if (body.status != null) {
    const st = String(body.status).trim();
    if (!isCorporateLeadStatus(st)) {
      const e = new Error(`Недопустимый status: ${st}`);
      e.code = 'VALIDATION';
      throw e;
    }
    data.status = st;
  }
  const row = await prisma.corporateLead.update({
    where: { id },
    data,
    include: { companyAccount: { select: { id: true, companyName: true, status: true } } }
  });
  return serializeCorporateLead(row);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} leadId
 * @param {{ defaultBranchId?: string | null }} opts
 */
export async function convertLeadToCompany(prisma, leadId, opts) {
  const lead = await prisma.corporateLead.findUnique({ where: { id: leadId } });
  if (!lead) {
    const e = new Error('Лид не найден');
    e.code = 'NOT_FOUND';
    throw e;
  }
  if (lead.companyAccountId) {
    const e = new Error('Лид уже привязан к компании');
    e.code = 'CONFLICT';
    throw e;
  }
  const defaultBranchId =
    opts.defaultBranchId != null && String(opts.defaultBranchId).trim()
      ? String(opts.defaultBranchId).trim()
      : null;
  if (defaultBranchId) {
    const b = await prisma.branch.findUnique({ where: { id: defaultBranchId } });
    if (!b) {
      const e = new Error('Филиал не найден');
      e.code = 'VALIDATION';
      throw e;
    }
  }
  const phone = normalizePhone(lead.phone);
  const account = await prisma.$transaction(async (tx) => {
    const acc = await tx.companyAccount.create({
      data: {
        companyName: lead.companyName,
        city: lead.city,
        address: lead.address,
        notes: `Создано из лида ${lead.id}`,
        status: 'ACTIVE',
        defaultBranchId,
        contacts: {
          create: {
            name: lead.contactName,
            phone: phone.length >= 11 ? phone : lead.phone,
            roleTitle: null,
            preferredContactMethod: null
          }
        }
      }
    });
    await tx.corporateLead.update({
      where: { id: leadId },
      data: {
        companyAccountId: acc.id,
        status: 'ACTIVE'
      }
    });
    return acc;
  });
  const full = await prisma.companyAccount.findUnique({
    where: { id: account.id },
    include: {
      contacts: { orderBy: { createdAt: 'asc' } },
      defaultBranch: { select: { id: true, name: true } }
    }
  });
  const leadRow = await prisma.corporateLead.findUnique({
    where: { id: leadId },
    include: { companyAccount: { select: { id: true, companyName: true, status: true } } }
  });
  return {
    companyAccount: serializeCompanyAccount(full),
    lead: leadRow ? serializeCorporateLead(leadRow) : null
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Record<string, unknown>} body
 */
export async function createCompanyAccount(prisma, body) {
  const companyName = String(body.companyName ?? '').trim();
  const city = String(body.city ?? '').trim();
  const address = String(body.address ?? '').trim();
  if (!companyName || !city || !address) {
    const e = new Error('companyName, city, address обязательны');
    e.code = 'VALIDATION';
    throw e;
  }
  const st = body.status != null ? String(body.status).trim() : 'NEW';
  if (!isCompanyAccountStatus(st)) {
    const e = new Error(`Недопустимый status: ${st}`);
    e.code = 'VALIDATION';
    throw e;
  }
  let defaultBranchId = null;
  if (body.defaultBranchId != null && String(body.defaultBranchId).trim()) {
    defaultBranchId = String(body.defaultBranchId).trim();
    const b = await prisma.branch.findUnique({ where: { id: defaultBranchId } });
    if (!b) {
      const e = new Error('Филиал не найден');
      e.code = 'VALIDATION';
      throw e;
    }
  }
  const notes = body.notes != null ? String(body.notes).trim().slice(0, 2000) || null : null;

  const primary = body.primaryContact;
  /** @type {import('@prisma/client').Prisma.CompanyAccountCreateInput} */
  const data = {
    companyName: companyName.slice(0, 200),
    city: city.slice(0, 120),
    address: address.slice(0, 500),
    notes,
    status: st,
    defaultBranchId
  };
  if (primary && typeof primary === 'object') {
    const nm = String(primary.name ?? '').trim();
    const ph = normalizePhone(primary.phone);
    if (nm && ph.length >= 11) {
      data.contacts = {
        create: {
          name: nm.slice(0, 120),
          phone: ph,
          roleTitle: primary.roleTitle != null ? String(primary.roleTitle).trim().slice(0, 120) || null : null,
          preferredContactMethod:
            primary.preferredContactMethod != null
              ? String(primary.preferredContactMethod).trim().slice(0, 64) || null
              : null
        }
      };
    }
  }

  const row = await prisma.companyAccount.create({
    data,
    include: {
      contacts: { orderBy: { createdAt: 'asc' } },
      defaultBranch: { select: { id: true, name: true } }
    }
  });
  return serializeCompanyAccount(row);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} id
 * @param {Record<string, unknown>} body
 */
export async function patchCompanyAccount(prisma, id, body) {
  const cur = await prisma.companyAccount.findUnique({ where: { id } });
  if (!cur) {
    const e = new Error('Компания не найдена');
    e.code = 'NOT_FOUND';
    throw e;
  }
  /** @type {import('@prisma/client').Prisma.CompanyAccountUpdateInput} */
  const data = {};
  if (body.companyName != null) data.companyName = String(body.companyName).trim().slice(0, 200);
  if (body.city != null) data.city = String(body.city).trim().slice(0, 120);
  if (body.address != null) data.address = String(body.address).trim().slice(0, 500);
  if (body.notes !== undefined) {
    data.notes = body.notes != null ? String(body.notes).trim().slice(0, 2000) || null : null;
  }
  if (body.status != null) {
    const st = String(body.status).trim();
    if (!isCompanyAccountStatus(st)) {
      const e = new Error(`Недопустимый status: ${st}`);
      e.code = 'VALIDATION';
      throw e;
    }
    data.status = st;
  }
  if (body.defaultBranchId !== undefined) {
    const raw = body.defaultBranchId;
    if (raw == null || raw === '') {
      data.defaultBranchId = null;
    } else {
      const bid = String(raw).trim();
      const b = await prisma.branch.findUnique({ where: { id: bid } });
      if (!b) {
        const e = new Error('Филиал не найден');
        e.code = 'VALIDATION';
        throw e;
      }
      data.defaultBranchId = bid;
    }
  }
  const row = await prisma.companyAccount.update({
    where: { id },
    data,
    include: {
      contacts: { orderBy: { createdAt: 'asc' } },
      defaultBranch: { select: { id: true, name: true } }
    }
  });
  return serializeCompanyAccount(row);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} companyAccountId
 * @param {Record<string, unknown>} body
 */
export async function addCompanyContact(prisma, companyAccountId, body) {
  const acc = await prisma.companyAccount.findUnique({ where: { id: companyAccountId } });
  if (!acc) {
    const e = new Error('Компания не найдена');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const name = String(body.name ?? '').trim();
  const phone = normalizePhone(body.phone);
  if (!name || phone.length < 11) {
    const e = new Error('name и корректный phone обязательны');
    e.code = 'VALIDATION';
    throw e;
  }
  await prisma.companyContact.create({
    data: {
      companyAccountId,
      name: name.slice(0, 120),
      phone,
      roleTitle: body.roleTitle != null ? String(body.roleTitle).trim().slice(0, 120) || null : null,
      preferredContactMethod:
        body.preferredContactMethod != null
          ? String(body.preferredContactMethod).trim().slice(0, 64) || null
          : null
    }
  });
  const row = await prisma.companyAccount.findUnique({
    where: { id: companyAccountId },
    include: {
      contacts: { orderBy: { createdAt: 'asc' } },
      defaultBranch: { select: { id: true, name: true } }
    }
  });
  return serializeCompanyAccount(row);
}