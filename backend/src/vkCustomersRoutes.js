/**
 * VK-база клиентов: все кто писал в группу + данные из заказов + сканирование 30 сообщений.
 */

const PHONE_RE = /(?:\+7|8|7)[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g;
const ADDR_RE = /(?:ул\.?|улица|пер\.?|переулок|просп\.?|проспект|пр-т|бульвар|бул\.?|пл\.?|площадь|ш\.?|шоссе|наб\.?|набережная)\s+[\w\s«»"№\-.]+?\d+[\w\/\-]*/gi;

// Наши собственные номера — исключаем из базы клиентов
const OWN_PHONES = new Set(['+79191210013']);

function extractPhone(text) {
  if (!text) return null;
  const m = String(text).match(PHONE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '');
  let phone = null;
  if (digits.length === 11) phone = '+7' + digits.slice(1);
  else if (digits.length === 10) phone = '+7' + digits;
  if (phone && OWN_PHONES.has(phone)) return null;
  return phone;
}

function extractAddress(text) {
  if (!text) return null;
  const m = String(text).match(ADDR_RE);
  return m ? m[0].trim() : null;
}

function searchInTexts(messages) {
  const texts = messages.map(m => m.text || '').join('\n');
  return {
    phone: extractPhone(texts),
    address: extractAddress(texts)
  };
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function vkPost(method, params, token) {
  const p = new URLSearchParams({ ...params, access_token: token, v: '5.131' });
  const r = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p.toString()
  });
  return r.json().catch(() => null);
}

export async function buildVkCustomerList(token, prisma) {
  // 1. Загрузить все переписки постранично
  const convs = [];
  const nameMap = new Map();
  let offset = 0;
  const PAGE = 200;

  while (true) {
    const j = await vkPost('messages.getConversations', {
      count: PAGE, offset, filter: 'all', extended: 1
    }, token);
    const resp = j?.response;
    if (!resp) break;
    for (const u of (resp.profiles || [])) {
      if (!u.deactivated) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
        if (name) nameMap.set(u.id, name);
      }
    }
    const items = resp.items || [];
    convs.push(...items);
    if (items.length < PAGE) break;
    offset += PAGE;
    await delay(340);
  }

  // 2. Только пользователи
  const userConvs = convs.filter(c => {
    const id = c.conversation?.peer?.id;
    return id > 0 && id < 2_000_000_000;
  });

  // Если profiles не пришли — догружаем users.get
  const missing = userConvs.map(c => c.conversation.peer.id).filter(id => !nameMap.has(id));
  for (let i = 0; i < missing.length; i += 500) {
    const chunk = missing.slice(i, i + 500);
    const j2 = await vkPost('users.get', {
      user_ids: chunk.join(','), fields: 'first_name,last_name'
    }, token);
    for (const u of (j2?.response || [])) {
      if (!u.deactivated) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
        if (name) nameMap.set(u.id, name);
      }
    }
    if (i + 500 < missing.length) await delay(340);
  }

  // 3. Заказы из БД
  const allOrders = await prisma.deliveryOrder.findMany({
    where: { attributionJson: { not: null } },
    select: { attributionJson: true, customerPhone: true, address: true },
    orderBy: { createdAt: 'desc' }
  });
  const orderByPeer = new Map();
  for (const o of allOrders) {
    if (!o.attributionJson) continue;
    for (const c of userConvs) {
      const pid = String(c.conversation.peer.id);
      if (orderByPeer.has(pid)) continue;
      if (o.attributionJson.includes(pid)) {
        orderByPeer.set(pid, { phone: o.customerPhone || null, address: o.address || null });
      }
    }
  }

  // 4. Определяем кого нужно сканировать (нет данных из заказов + активны за последний год)
  const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 3600;
  const toScan = userConvs.filter(c => {
    const pid = String(c.conversation.peer.id);
    const od = orderByPeer.get(pid) || {};
    const hasAll = od.phone && od.address;
    const ts = c.last_message?.date || 0;
    return !hasAll && ts > oneYearAgo;
  });

  // 5. Сканируем историю (30 сообщений) — max 600 чатов по 100мс
  const msgDataByPeer = new Map();
  const scanLimit = Math.min(toScan.length, 600);
  for (let i = 0; i < scanLimit; i++) {
    const peerId = toScan[i].conversation.peer.id;
    const od = orderByPeer.get(String(peerId)) || {};
    const needPhone = !od.phone;
    const needAddr = !od.address;

    const j3 = await vkPost('messages.getHistory', {
      peer_id: peerId, count: 30, rev: 0
    }, token);
    const msgs = j3?.response?.items || [];
    if (msgs.length > 0) {
      const found = searchInTexts(msgs);
      msgDataByPeer.set(String(peerId), {
        phone: needPhone ? found.phone : null,
        address: needAddr ? found.address : null
      });
    }
    await delay(100);
  }

  // 6. Собрать результат
  const result = userConvs.map(c => {
    const peerId = c.conversation.peer.id;
    const peerStr = String(peerId);
    const lm = c.last_message || {};
    const ts = lm.date || 0;
    const od = orderByPeer.get(peerStr) || {};
    const md = msgDataByPeer.get(peerStr) || {};

    return {
      vkId: peerId,
      name: nameMap.get(peerId) || null,
      vkUrl: `https://vk.com/id${peerId}`,
      phone: od.phone || md.phone || null,
      address: od.address || md.address || null,
      lastMessageDate: ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null,
      lastMessageTs: ts,
      phoneSource: od.phone ? 'order' : md.phone ? 'message' : null,
      addrSource: od.address ? 'order' : md.address ? 'message' : null
    };
  });

  const jan2023 = new Date('2023-01-01T00:00:00Z').getTime() / 1000;

  result.sort((a, b) => b.lastMessageTs - a.lastMessageTs);
  return result.filter(r => r.name && r.lastMessageTs >= jan2023);
}

export function createVkCustomersRouter(prisma) {
  let cache = null;
  let cacheAt = 0;
  const CACHE_TTL = 30 * 60 * 1000; // 30 минут — сканирование долгое

  return async function vkCustomersHandler(req, res) {
    const token = (process.env.VK_GROUP_ACCESS_TOKEN || '').trim();
    if (!token) {
      return res.status(500).json({ ok: false, error: { message: 'VK_GROUP_ACCESS_TOKEN not set' } });
    }
    const refresh = req.query.refresh === '1';
    const now = Date.now();
    if (!refresh && cache && now - cacheAt < CACHE_TTL) {
      return res.json({ ok: true, data: cache, cached: true });
    }
    try {
      const list = await buildVkCustomerList(token, prisma);
      cache = list;
      cacheAt = now;
      res.json({ ok: true, data: list, cached: false });
    } catch (e) {
      res.status(500).json({ ok: false, error: { message: e.message || 'error' } });
    }
  };
}
