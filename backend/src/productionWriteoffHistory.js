/**
 * История партий списания по производству v1 — только чтение.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 * @param {string} date
 */
export async function listProductionWriteoffBatches(prisma, branchId, date) {
  return prisma.productionWriteoffBatch.findMany({
    where: { branchId: String(branchId), date: String(date) },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} batchId
 */
export async function getProductionWriteoffBatchDetail(prisma, batchId) {
  return prisma.productionWriteoffBatch.findFirst({
    where: { id: String(batchId).trim() },
    include: {
      branch: { select: { id: true, name: true } },
      lines: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        include: {
          menuDayItem: { select: { name: true } }
        }
      },
      movementLinks: {
        include: {
          stockMovement: {
            include: {
              ingredient: { select: { name: true } },
              unit: { select: { code: true } }
            }
          }
        }
      }
    }
  });
}

/**
 * @param {Awaited<ReturnType<typeof listProductionWriteoffBatches>>[number]} row
 */
export function serializeProductionWriteoffBatchListItem(row) {
  return {
    id: row.id,
    branchId: row.branchId,
    date: row.date,
    createdAt: row.createdAt.toISOString(),
    note: row.note,
    affectedPositionsCount: row.affectedPositionsCount,
    createdMovementCount: row.createdMovementCount
  };
}

/**
 * @param {Awaited<ReturnType<typeof getProductionWriteoffBatchDetail>>} batch
 */
export function serializeProductionWriteoffBatchDetail(batch) {
  if (!batch) return null;
  return {
    ...serializeProductionWriteoffBatchListItem(batch),
    branchName: batch.branch?.name,
    lines: (batch.lines || []).map((ln) => ({
      id: ln.id,
      menuDayItemId: ln.menuDayItemId,
      menuDayItemName: ln.menuDayItem?.name,
      position: ln.position,
      writeoffQty: String(ln.writeoffQty),
      dishVersionId: ln.dishVersionId,
      createdAt: ln.createdAt.toISOString()
    })),
    movements: (batch.movementLinks || []).map((link) => ({
      stockMovementId: link.stockMovementId,
      ingredientId: link.stockMovement?.ingredientId,
      ingredientName: link.stockMovement?.ingredient?.name,
      unitCode: link.stockMovement?.unit?.code,
      quantity: link.stockMovement?.quantity != null ? String(link.stockMovement.quantity) : null,
      note: link.stockMovement?.note
    }))
  };
}
