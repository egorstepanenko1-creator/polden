import { Prisma } from '@prisma/client';
import { validateDishVersionForProduction } from './dayProductionRequirements.js';
import { movementSignedQuantity } from './stockMovement.js';

const EPS = 1e-9;

const REASON_LABELS = {
  version_not_found: 'версия блюда не найдена',
  not_published: 'рецепт не опубликован',
  empty_composition: 'пустой состав',
  unit_mismatch: 'единица строки рецепта не совпадает с базовой единицей ингредиента',
  invalid_quantity: 'некорректное количество в рецепте'
};

/**
 * Сумма writeoffQty по всем партиям для branch+date, по menuDayItemId.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 * @param {string} date
 * @returns {Promise<Map<string, number>>}
 */
export async function getWrittenOffQtyByMenuDayItem(prisma, branchId, date) {
  const lines = await prisma.productionWriteoffLine.findMany({
    where: {
      batch: { branchId: String(branchId), date: String(date) }
    },
    select: { menuDayItemId: true, writeoffQty: true }
  });
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const ln of lines) {
    const q = Number(ln.writeoffQty);
    if (!Number.isFinite(q)) continue;
    map.set(ln.menuDayItemId, (map.get(ln.menuDayItemId) || 0) + q);
  }
  return map;
}

/**
 * Дополняет payload дня производства полями alreadyWrittenOffQty, remainingWriteoffQty, overWrittenOff.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ branchId: string, date: string, positions: Array<{ menuDayItemId: string, productionQty: number }> }} payload
 */
export async function mergeWriteoffProgressIntoDayProductionPayload(prisma, payload) {
  const sums = await getWrittenOffQtyByMenuDayItem(prisma, payload.branchId, payload.date);
  for (const p of payload.positions) {
    const already = sums.get(p.menuDayItemId) || 0;
    const prod = Number(p.productionQty);
    p.alreadyWrittenOffQty = already;
    p.remainingWriteoffQty = Math.max(prod - already, 0);
    p.overWrittenOff = already > prod + EPS;
  }
  return payload;
}

/**
 * Ручное списание по производству: порции по слотам меню × строки рецепта → движения PRODUCTION_CONSUMPTION.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} branchId
 * @param {string} date YYYY-MM-DD
 * @param {Array<{ menuDayItemId?: string, position?: number, writeoffQty?: unknown }>} positionsIn
 * @param {{ confirm: boolean, note?: string | null }} opts — без confirm:true только превью, движения не создаются
 */
export async function runProductionWriteoff(prisma, branchId, date, positionsIn, opts) {
  const confirm = Boolean(opts?.confirm);
  const userNote =
    opts?.note != null && String(opts.note).trim() !== '' ? String(opts.note).trim().slice(0, 500) : null;

  const b = await prisma.branch.findUnique({ where: { id: String(branchId) } });
  if (!b) {
    const e = new Error('Филиал не найден');
    e.code = 'NOT_FOUND';
    throw e;
  }

  if (!Array.isArray(positionsIn)) {
    const e = new Error('Поле positions должно быть массивом');
    e.code = 'VALIDATION';
    throw e;
  }

  const menuRows = await prisma.menuDayItem.findMany({
    where: { branchId: String(branchId), date: String(date) },
    orderBy: { position: 'asc' }
  });

  const byId = new Map(menuRows.map((m) => [m.id, m]));
  const byPos = new Map(menuRows.map((m) => [m.position, m]));

  const versionIds = [...new Set(menuRows.map((m) => m.dishVersionId).filter(Boolean))];
  const versions =
    versionIds.length === 0
      ? []
      : await prisma.dishVersion.findMany({
          where: { id: { in: versionIds } },
          include: {
            lines: {
              include: {
                ingredient: { include: { defaultUnit: true } },
                unit: true
              }
            }
          }
        });
  const versionById = new Map(versions.map((v) => [v.id, v]));

  /** @type {Map<string, number>} */
  const writeoffByMenuId = new Map();

  for (const raw of positionsIn) {
    const wq = Number(raw?.writeoffQty);
    if (!Number.isFinite(wq) || wq < 0) {
      const e = new Error('Каждое writeoffQty должно быть числом ≥ 0');
      e.code = 'VALIDATION';
      throw e;
    }
    if (wq === 0) continue;

    let row = null;
    if (raw.menuDayItemId != null && String(raw.menuDayItemId).trim() !== '') {
      row = byId.get(String(raw.menuDayItemId).trim()) ?? null;
      if (!row) {
        const e = new Error(`Строка меню не найдена: menuDayItemId=${raw.menuDayItemId}`);
        e.code = 'NOT_FOUND';
        throw e;
      }
    } else if (raw.position != null && raw.position !== '') {
      const pos = Number(raw.position);
      if (!Number.isInteger(pos)) {
        const e = new Error('Без menuDayItemId поле position должно быть целым числом');
        e.code = 'VALIDATION';
        throw e;
      }
      row = byPos.get(pos) ?? null;
      if (!row) {
        const e = new Error(`Строка меню не найдена: position=${pos}, date=${date}`);
        e.code = 'NOT_FOUND';
        throw e;
      }
    } else {
      const e = new Error('В каждой позиции укажите menuDayItemId или position');
      e.code = 'VALIDATION';
      throw e;
    }

    writeoffByMenuId.set(row.id, (writeoffByMenuId.get(row.id) || 0) + wq);
  }

  if (writeoffByMenuId.size === 0) {
    const e = new Error('Нет положительных количеств списания — нечего проводить');
    e.code = 'VALIDATION';
    throw e;
  }

  /** @type {Array<{ menuDayItemId: string, position: number, name: string, writeoffQty: number, dishVersionId: string | null }>} */
  const positionsDetail = [];

  /** @type {Map<string, { ingredientId: string, ingredientName: string, unitId: string, unitCode: string, unitDisplayName: string, quantity: number }>} */
  const ingMap = new Map();

  for (const [menuId, writeoffQty] of writeoffByMenuId) {
    const m = byId.get(menuId);
    if (!m) continue;

    if (!m.dishVersionId) {
      const e = new Error(
        `Списание отклонено: позиция ${m.position} («${m.name}») без привязанного блюда/рецепта. Привяжите опубликованную версию в «Меню на день».`
      );
      e.code = 'VALIDATION';
      throw e;
    }

    const v = versionById.get(m.dishVersionId);
    const vr = validateDishVersionForProduction(v);
    if (!vr.ok) {
      const human = REASON_LABELS[vr.reason] || vr.reason;
      const e = new Error(
        `Списание отклонено: позиция ${m.position} («${m.name}») — рецепт недействителен (${human}).`
      );
      e.code = 'VALIDATION';
      throw e;
    }

    positionsDetail.push({
      menuDayItemId: m.id,
      position: m.position,
      name: m.name,
      writeoffQty,
      dishVersionId: m.dishVersionId
    });

    for (const line of v.lines) {
      const perPortion = Number(line.quantity);
      const add = perPortion * writeoffQty;
      if (!Number.isFinite(add) || add <= 0) continue;
      const key = `${line.ingredientId}\t${line.unitId}`;
      const prev = ingMap.get(key);
      if (prev) {
        prev.quantity += add;
      } else {
        ingMap.set(key, {
          ingredientId: line.ingredientId,
          ingredientName: line.ingredient.name,
          unitId: line.unitId,
          unitCode: line.unit.code,
          unitDisplayName: line.unit.displayName,
          quantity: add
        });
      }
    }
  }

  const ingredientTotals = [...ingMap.values()].sort((a, b) =>
    a.ingredientName.localeCompare(b.ingredientName, 'ru')
  );

  if (ingredientTotals.length === 0) {
    const e = new Error(
      'Списание отклонено: суммарное количество по ингредиентам равно нулю (в рецепте нули или нет расхода на эти порции).'
    );
    e.code = 'VALIDATION';
    throw e;
  }

  const portionSummary = positionsDetail
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((a) => `p${a.position}×${a.writeoffQty}`)
    .join(',');

  const occurredAt = new Date();

  if (!confirm) {
    return {
      preview: true,
      branchId: String(branchId),
      date: String(date),
      createdMovementCount: 0,
      affectedPositionsCount: positionsDetail.length,
      ingredientTotals,
      positionsDetail,
      confirmRequired: true
    };
  }

  const { productionWriteoffBatchId, movementIds } = await prisma.$transaction(async (tx) => {
    const batch = await tx.productionWriteoffBatch.create({
      data: {
        branchId: String(branchId),
        date: String(date),
        note: userNote,
        affectedPositionsCount: positionsDetail.length,
        createdMovementCount: ingredientTotals.length
      }
    });

    for (const pd of positionsDetail) {
      await tx.productionWriteoffLine.create({
        data: {
          productionWriteoffBatchId: batch.id,
          menuDayItemId: pd.menuDayItemId,
          position: pd.position,
          writeoffQty: new Prisma.Decimal(String(pd.writeoffQty)),
          dishVersionId: pd.dishVersionId
        }
      });
    }

    const baseNoteCore = `PRODUCTION_WRITEOFF branchId=${branchId} date=${date} batchId=${batch.id} portions=${portionSummary}`;
    const baseNote = userNote
      ? `${baseNoteCore} note=${userNote.replace(/\s+/g, ' ')}`.slice(0, 2000)
      : baseNoteCore.slice(0, 2000);

    /** @type {string[]} */
    const movementIdsInner = [];

    for (const tot of ingredientTotals) {
      const row = await tx.stockMovement.create({
        data: {
          branchId: String(branchId),
          ingredientId: tot.ingredientId,
          unitId: tot.unitId,
          movementType: 'PRODUCTION_CONSUMPTION',
          quantity: new Prisma.Decimal(String(tot.quantity)),
          occurredAt,
          note: baseNote
        }
      });
      movementSignedQuantity(row.movementType, Number(row.quantity));
      movementIdsInner.push(row.id);
      await tx.productionWriteoffMovementLink.create({
        data: {
          productionWriteoffBatchId: batch.id,
          stockMovementId: row.id
        }
      });
    }

    return { productionWriteoffBatchId: batch.id, movementIds: movementIdsInner };
  });

  return {
    preview: false,
    branchId: String(branchId),
    date: String(date),
    productionWriteoffBatchId,
    createdMovementCount: movementIds.length,
    affectedPositionsCount: positionsDetail.length,
    ingredientTotals,
    positionsDetail,
    movementIds
  };
}
