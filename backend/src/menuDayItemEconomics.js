/**
 * Menu-day economics linkage (KITCHEN_ECONOMICS_V1_SPEC § menu snapshot).
 *
 * Snapshot rule (v1):
 * - `at` for foodCostKopeks is `new Date()` at the moment of the protected write (server clock).
 * - On upsert with non-null `dishVersionId`: require DishVersion.status === 'published', then store
 *   foodCostKopeksSnapshot + foodCostSnapshottedAt = `at`.
 * - On upsert with null `dishVersionId`: clear dishVersionId, snapshot, and snapshottedAt.
 * - No automatic backfill of historical rows.
 */

import { foodCostKopeks } from './foodCost.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string | null | undefined} dishVersionId
 * @returns {Promise<{ dishVersionId: string | null, foodCostKopeksSnapshot: number | null, foodCostSnapshottedAt: Date | null }>}
 */
export async function resolveMenuDayEconomicsFields(prisma, dishVersionId) {
  const raw = dishVersionId == null || dishVersionId === '' ? null : String(dishVersionId);
  const at = new Date();

  if (!raw) {
    return {
      dishVersionId: null,
      foodCostKopeksSnapshot: null,
      foodCostSnapshottedAt: null
    };
  }

  const version = await prisma.dishVersion.findUnique({ where: { id: raw } });
  if (!version) {
    throw new Error(`DishVersion not found: ${raw}`);
  }
  if (version.status !== 'published') {
    throw new Error(`DishVersion must be published to attach to menu (id=${raw}, status=${version.status})`);
  }

  const foodCostKopeksSnapshot = await foodCostKopeks(prisma, raw, at);

  return {
    dishVersionId: raw,
    foodCostKopeksSnapshot,
    foodCostSnapshottedAt: at
  };
}
