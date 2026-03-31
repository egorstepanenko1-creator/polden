/**
 * Procurement Board v1 — агрегаты по черновикам закупки для операционного обзора.
 */

const EPS = 1e-9;

/**
 * Остаток к закупке в деньгах по строке v1:
 * при remainingNeedQty > 0, supplierId задан, packQuantity > 0, pricePerPackKopeks задано:
 * outstandingPacksNeeded = ceil(remainingNeedQty / packQuantity)
 * outstandingLineKopeks = outstandingPacksNeeded * pricePerPackKopeks
 * Иначе строка не вкладкуётся в outstanding (нет снимка оффера).
 *
 * @param {Array<{
 *   supplierId: string | null,
 *   purchaseNeedQty: unknown,
 *   receivedBaseQtyTotal?: unknown,
 *   packQuantity?: unknown,
 *   pricePerPackKopeks?: number | null,
 *   estimatedBuyCostKopeks?: number | null
 * }>} lines
 */
export function computeDraftBoardFields(lines) {
  let missingOfferLineCount = 0;
  let totalEstimatedCostKopeks = 0;
  let outstandingEstimatedCostKopeks = 0;
  let receivedLineCount = 0;
  let remainingLineCount = 0;

  for (const ln of lines) {
    if (ln.supplierId == null) missingOfferLineCount += 1;

    const need = Number(ln.purchaseNeedQty);
    const got = Number(ln.receivedBaseQtyTotal ?? 0);
    const remainingNeedQty = Math.max(need - got, 0);

    if (got + EPS >= need) receivedLineCount += 1;
    if (remainingNeedQty > EPS) remainingLineCount += 1;

    const est = ln.estimatedBuyCostKopeks;
    if (est != null && Number.isFinite(Number(est))) {
      totalEstimatedCostKopeks += Number(est);
    }

    if (remainingNeedQty > EPS && ln.supplierId != null) {
      const packQty = ln.packQuantity != null ? Number(ln.packQuantity) : NaN;
      const price = ln.pricePerPackKopeks;
      if (Number.isFinite(packQty) && packQty > EPS && price != null && Number.isFinite(Number(price))) {
        const packs = Math.ceil(remainingNeedQty / packQty - 1e-12);
        outstandingEstimatedCostKopeks += packs * Number(price);
      }
    }
  }

  return {
    lineCount: lines.length,
    missingOfferLineCount,
    totalEstimatedCostKopeks,
    outstandingEstimatedCostKopeks,
    receivedLineCount,
    remainingLineCount
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   branchId?: string,
 *   date?: string,
 *   receiptStatus?: string,
 *   limit?: number
 * }} query
 */
export async function getProcurementBoardPayload(prisma, query) {
  const branchId = query.branchId != null ? String(query.branchId).trim() : '';
  const date = query.date != null ? String(query.date).trim() : '';
  const receiptStatus = query.receiptStatus != null ? String(query.receiptStatus).trim() : '';
  const limitRaw = query.limit != null ? Number(query.limit) : 500;
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 500, 1), 500);

  /** @type {import('@prisma/client').Prisma.PurchaseDraftWhereInput} */
  const where = {};
  if (branchId) where.branchId = branchId;
  if (date) where.date = date;
  if (receiptStatus === 'NONE' || receiptStatus === 'RECEIVED_PARTIAL' || receiptStatus === 'RECEIVED_FULL') {
    where.receiptStatus = receiptStatus;
  }

  const drafts = await prisma.purchaseDraft.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      branch: { select: { name: true } },
      lines: true
    }
  });

  const filtersApplied = {
    branchId: branchId || null,
    date: date || null,
    receiptStatus: receiptStatus || null,
    limit
  };

  let noneCount = 0;
  let partialCount = 0;
  let fullCount = 0;
  let missingOfferLineCountSum = 0;
  let outstandingEstimatedCostKopeksSum = 0;

  const draftPayloads = drafts.map((d) => {
    const rs = d.receiptStatus ?? 'NONE';
    if (rs === 'NONE') noneCount += 1;
    else if (rs === 'RECEIVED_PARTIAL') partialCount += 1;
    else if (rs === 'RECEIVED_FULL') fullCount += 1;

    const f = computeDraftBoardFields(d.lines);
    missingOfferLineCountSum += f.missingOfferLineCount;
    outstandingEstimatedCostKopeksSum += f.outstandingEstimatedCostKopeks;

    return {
      id: d.id,
      branchId: d.branchId,
      branchName: d.branch.name,
      date: d.date,
      createdAt: d.createdAt.toISOString(),
      receiptStatus: rs,
      lastReceivedAt: d.lastReceivedAt ? d.lastReceivedAt.toISOString() : null,
      status: d.status,
      note: d.note,
      lineCount: f.lineCount,
      missingOfferLineCount: f.missingOfferLineCount,
      totalEstimatedCostKopeks: f.totalEstimatedCostKopeks,
      outstandingEstimatedCostKopeks: f.outstandingEstimatedCostKopeks,
      receivedLineCount: f.receivedLineCount,
      remainingLineCount: f.remainingLineCount
    };
  });

  const summary = {
    draftCount: drafts.length,
    noneCount,
    partialCount,
    fullCount,
    missingOfferLineCount: missingOfferLineCountSum,
    outstandingEstimatedCostKopeks: outstandingEstimatedCostKopeksSum
  };

  return { filtersApplied, summary, drafts: draftPayloads };
}
