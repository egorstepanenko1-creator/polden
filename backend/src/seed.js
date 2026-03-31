import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Локальный календарный «завтра» YYYY-MM-DD (как на лендинге), без UTC-сдвига toISOString(). */
function tomorrowLocalISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  const existing = await prisma.branch.count();
  if (existing > 0) {
    console.log('Seed skip: branches already exist');
    return;
  }

  const branch = await prisma.branch.create({
    data: { name: 'Новосибирск · Центр' }
  });

  const date = tomorrowLocalISO();
  const demo = [
    { position: 1, name: 'Суп дня', price: 330_00 },
    { position: 3, name: 'Горячее дня', price: 330_00 },
    { position: 5, name: 'Салат дня', price: 330_00 },
    { position: 7, name: 'Компот 0,5л', price: 70_00 }
  ];

  for (const row of demo) {
    await prisma.menuDayItem.create({
      data: {
        branchId: branch.id,
        date,
        position: row.position,
        name: row.name,
        price: row.price
      }
    });
  }

  console.log('Seeded branch', branch.id, 'menu for', date);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
