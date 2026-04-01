/**
 * Четверг: нормализация блюд + опубликованная v1 с одной строкой-заглушкой в составе.
 *
 * НЕ трогает: StockMovement, ProductionWriteoff*, PurchaseDraft*, Inventory*, DeliveryOrder, Vk*, MenuDayItem, Branch (не изменяет записи Branch).
 *
 * Ветко-безопасность: TARGET_BRANCH_ID или --branch-id= обязательны — скрипт проверяет, что Branch существует,
 * логирует id+имя и предупреждает, если имя похоже на устаревший рынок (Новосибирск). Сами Dish глобальные;
 * привязка к точке делается только вручную в «Меню на день» (MenuDayItem).
 *
 * DRY_RUN=1 или флаг --dry-run: только чтение БД + план, без создания/обновления сущностей.
 *
 * Запуск (из каталога backend):
 *   TARGET_BRANCH_ID=<cuid_точки_Чебаркуль> node scripts/seed-thursday-menu-safe.mjs
 *   node scripts/seed-thursday-menu-safe.mjs --branch-id=<cuid>
 *   DRY_RUN=1 TARGET_BRANCH_ID=<cuid> node scripts/seed-thursday-menu-safe.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { foodCostKopeks } from '../src/foodCost.js';

const prisma = new PrismaClient();

const PLACEHOLDER_INGREDIENT_NAME =
  '(ТТК/меню v1) заглушка состава — без автосписания со склада; нормы в notes версии / внешнем файле';

const EPOCH = new Date('2020-01-01T00:00:00.000Z');

/** @type {Array<{ name: string, category: string, notes: string }>} */
const THURSDAY = [
  {
    name: 'Суп с фрикадельками',
    category: 'Суп',
    notes:
      '__truth__:confirmed_from_source|ttk_code:SUP-07|ttk_rel_path:project/new/ttk_obedy_75_blyud_ru/02_Супы/SUP-07_Суп_с_фрикадельками.md|' +
      'crm_composition:placeholder_only|netto_g_summary:бульон240,фарш45,картоф40,морковь12,лук10,рис12,масло5,укроп3|' +
      'warning:В CRM одна строка-заглушка для публикации; детальный состав и закуп — только в карте TTK, не склад.'
  },
  {
    name: 'Окрошка',
    category: 'Суп',
    notes:
      '__truth__:drafted_gap_fill|draft_ref:docs/ttk_drafts_gaps/DRAFT_GAP-SUP-OKR-01_Окрошка.md|crm_composition:placeholder_only'
  },
  {
    name: 'Бигус с жареной колбаской',
    category: 'Горячее',
    notes:
      '__truth__:drafted_gap_fill|draft_ref:docs/ttk_drafts_gaps/DRAFT_GAP-HOT-BIG-01_Бигус_с_жареной_колбаской.md|crm_composition:placeholder_only'
  },
  {
    name: 'Плов',
    category: 'Горячее',
    notes:
      '__truth__:drafted_gap_fill|draft_ref:docs/ttk_drafts_gaps/DRAFT_GAP-HOT-PLOV-01_Плов.md|crm_composition:placeholder_only'
  },
  {
    name: 'Салат сельдь под шубой',
    category: 'Салат',
    notes:
      '__truth__:drafted_gap_fill|draft_ref:docs/ttk_drafts_gaps/DRAFT_GAP-SAL-SHU-01_Сельдь_под_шубой.md|crm_composition:placeholder_only'
  },
  {
    name: 'Салат столичный',
    category: 'Салат',
    notes:
      '__truth__:drafted_gap_fill|draft_ref:docs/ttk_drafts_gaps/DRAFT_GAP-SAL-STO-01_Салат_столичный.md|crm_composition:placeholder_only'
  },
  {
    name: 'Компот 0,5 л',
    category: 'Напиток',
    notes:
      '__truth__:drafted_gap_fill|draft_ref:docs/ttk_drafts_gaps/DRAFT_GAP-DRK-KOM-01_Компот_0_5л.md|crm_composition:placeholder_only'
  },
  {
    name: 'Каша пшено',
    category: 'Гарнир',
    notes:
      '__truth__:drafted_gap_fill|draft_ref:docs/ttk_drafts_gaps/DRAFT_GAP-SID-PSH-01_Каша_пшено.md|crm_composition:placeholder_only'
  },
  {
    name: 'Пирожок с рисом и яйцом',
    category: 'Выпечка',
    notes:
      '__truth__:drafted_gap_fill|draft_ref:docs/ttk_drafts_gaps/DRAFT_GAP-BKY-PIR-01_Пирожок_рис_яйцо.md|crm_composition:placeholder_only'
  }
];

function parseCli() {
  const argv = process.argv.slice(2);
  let branchId = (process.env.TARGET_BRANCH_ID || '').trim();
  let dryRun = (process.env.DRY_RUN || '').trim() === '1';
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('--branch-id=')) branchId = a.slice('--branch-id='.length).trim();
    else if (a === '--help' || a === '-h') {
      console.log(`
seed-thursday-menu-safe.mjs

Обязательно:
  TARGET_BRANCH_ID=<id>   или   --branch-id=<id>
  id — Branch.id операционной точки (например Чебаркуль), под которую вы будете вручную заполнять «Меню на день».

Опционально:
  DRY_RUN=1   или   --dry-run   — только проверка ветки и план по блюдам, без записей.

Скрипт не пишет MenuDayItem и не меняет склад.
`);
      process.exit(0);
    }
  }
  return { branchId, dryRun };
}

/**
 * @param {string} branchId
 */
async function resolveTargetBranch(branchId) {
  if (!branchId) {
    console.error(
      '[seed-thursday-menu] ОШИБКА: задайте целевую точку — TARGET_BRANCH_ID или --branch-id=<Branch.id>.\n' +
        'Dish/рецепты глобальные, но без явного id вы можете ошибочно считать, что сид «привязан» к точке. ' +
        'Возьмите id из CRM (точки доставки) или GET /api/public/branches.'
    );
    process.exit(1);
  }
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) {
    console.error(`[seed-thursday-menu] ОШИБКА: Branch не найден id=${branchId}`);
    process.exit(1);
  }
  return branch;
}

/**
 * @param {{ id: string, name: string }} branch
 */
function warnBranchMarket(branch) {
  if (/новосибирск/i.test(branch.name)) {
    console.warn(
      '[seed-thursday-menu] ВНИМАНИЕ: имя выбранной точки содержит «Новосибирск», а операционный рынок — Чебаркуль.\n' +
        '  Проверьте данные Branch (rename/API) и env VK (POLDEN_VK_DEFAULT_BRANCH_ID / POLDEN_VK_ORDER_PROBE_BRANCH_ID).\n' +
        '  Скрипт не переименует точку; слоты «Меню на день» в CRM выбирайте только для правильного Branch.id.'
    );
  }
}

async function ensurePlaceholderIngredient(dryRun) {
  if (dryRun) {
    const ex = await prisma.ingredient.findFirst({ where: { name: PLACEHOLDER_INGREDIENT_NAME } });
    console.log(
      '[DRY_RUN] Заглушка-ингредиент:',
      ex ? `уже есть id=${ex.id}` : 'будет создана при реальном запуске'
    );
    const unit = await prisma.unit.findFirst({ where: { code: 'g' } });
    console.log('[DRY_RUN] Unit g:', unit ? `есть id=${unit.id}` : 'будет создан при реальном запуске');
    if (!ex || !unit) return null;
    return { unitId: unit.id, ingredientId: ex.id };
  }

  let unit = await prisma.unit.findFirst({ where: { code: 'g' } });
  if (!unit) {
    unit = await prisma.unit.create({ data: { code: 'g', displayName: 'г' } });
    console.log('[write] создан Unit g', unit.id);
  }
  let ing = await prisma.ingredient.findFirst({ where: { name: PLACEHOLDER_INGREDIENT_NAME } });
  if (!ing) {
    ing = await prisma.ingredient.create({
      data: { name: PLACEHOLDER_INGREDIENT_NAME, defaultUnitId: unit.id, active: true }
    });
    console.log('[write] создан Ingredient (заглушка)', ing.id);
  }
  const price = await prisma.ingredientPrice.findFirst({
    where: {
      ingredientId: ing.id,
      unitId: unit.id,
      effectiveFrom: { lte: new Date() },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }]
    }
  });
  if (!price) {
    await prisma.ingredientPrice.create({
      data: {
        ingredientId: ing.id,
        unitId: unit.id,
        pricePerUnitKopeks: 0,
        effectiveFrom: EPOCH,
        effectiveTo: null
      }
    });
    console.log('[write] создан IngredientPrice 0 для заглушки');
  }
  return { unitId: unit.id, ingredientId: ing.id };
}

/**
 * @param {{ unitId: string, ingredientId: string } | null} p
 * @param {{ name: string, category: string, notes: string }} spec
 * @param {boolean} dryRun
 */
async function ensureDishPublishedPlaceholder(p, spec, dryRun) {
  const notes = spec.notes.slice(0, 2000);
  const dish = await prisma.dish.findFirst({ where: { name: spec.name } });
  const published = dish
    ? await prisma.dishVersion.findFirst({ where: { dishId: dish.id, status: 'published' } })
    : null;

  if (dryRun) {
    if (!dish) {
      console.log(`[DRY_RUN] ${spec.name}: создать Dish + DishVersion published v1 + 1×DishIngredient`);
    } else if (published) {
      console.log(`[DRY_RUN] ${spec.name}: пропуск (уже published ${published.id})`);
    } else {
      console.log(`[DRY_RUN] ${spec.name}: обновить/дополнить Dish, создать published v1 + строка состава`);
    }
    return;
  }

  if (!p) throw new Error('placeholder ingredient missing');

  let d = dish;
  if (!d) {
    d = await prisma.dish.create({
      data: { name: spec.name, category: spec.category, active: true }
    });
    console.log('[write] Dish создан', spec.name, d.id);
  } else {
    await prisma.dish.update({
      where: { id: d.id },
      data: { category: spec.category, active: true }
    });
  }

  if (published) {
    console.log('[skip] уже есть published:', spec.name);
    return;
  }

  const agg = await prisma.dishVersion.aggregate({
    where: { dishId: d.id },
    _max: { versionNumber: true }
  });
  const nextNum = (agg._max.versionNumber ?? 0) + 1;

  const draft = await prisma.dishVersion.create({
    data: {
      dishId: d.id,
      versionNumber: nextNum,
      status: 'draft',
      notes
    }
  });

  await prisma.dishIngredient.create({
    data: {
      dishVersionId: draft.id,
      ingredientId: p.ingredientId,
      unitId: p.unitId,
      quantity: 1
    }
  });

  const at = new Date();
  await foodCostKopeks(prisma, draft.id, at);
  await prisma.dishVersion.update({
    where: { id: draft.id },
    data: { status: 'published' }
  });

  console.log('[ok]', spec.name, '→ DishVersion', draft.id, '(placeholder line, food cost 0)');
}

async function main() {
  const { branchId, dryRun } = parseCli();
  const branch = await resolveTargetBranch(branchId);

  console.log('[seed-thursday-menu] Целевая точка (для операционного контекста, без записи в Branch):');
  console.log(`  Branch.id:   ${branch.id}`);
  console.log(`  Branch.name: ${branch.name}`);
  warnBranchMarket(branch);

  if (dryRun) {
    console.log('\n[DRY_RUN] Записи Dish/Ingredient/Unit/Price/VERSION не выполняются.\n');
  }

  const p = await ensurePlaceholderIngredient(dryRun);
  for (const spec of THURSDAY) {
    await ensureDishPublishedPlaceholder(p, spec, dryRun);
  }

  if (dryRun) {
    console.log('\n[DRY_RUN] Конец. Для записи уберите DRY_RUN/--dry-run.');
  } else {
    console.log(
      '\nГотово. Дальше в CRM: «Меню на день» → точка с id как выше → дата четверга → слоты 1–9 → привязка версий рецепта.'
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
