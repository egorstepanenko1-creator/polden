/**
 * VK Bots Long Poll API — получаем события без входящего вебхука.
 * Наш сервер сам опрашивает VK, поэтому не нужен публичный URL.
 */

import { handleVkIncomingMessage } from './vkBotHandler.js';

const POLL_WAIT = 25;
const RESTART_DELAY_MS = 3000;

async function getLongPollServer(token, groupId) {
  const url = 'https://api.vk.com/method/groups.getLongPollServer?' +
    'group_id=' + groupId +
    '&access_token=' + token +
    '&v=5.199';
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) {
    throw new Error('VK getLongPollServer error ' + json.error.error_code + ': ' + json.error.error_msg);
  }
  return json.response;
}

async function poll(server, key, ts) {
  const url = server + '?act=a_check&key=' + key + '&ts=' + ts + '&wait=' + POLL_WAIT;
  const res = await fetch(url, { signal: AbortSignal.timeout((POLL_WAIT + 10) * 1000) });
  return await res.json();
}

export async function startVkLongPoll(prisma) {
  const token = (process.env.VK_GROUP_ACCESS_TOKEN || '').trim();
  const groupId = (process.env.VK_GROUP_ID || '').trim();

  if (!token || !groupId) {
    console.warn('[vk-longpoll] VK_GROUP_ACCESS_TOKEN or VK_GROUP_ID not set — disabled');
    return;
  }

  console.log('[vk-longpoll] starting for group', groupId);

  while (true) {
    let server, key, ts;
    try {
      const lp = await getLongPollServer(token, groupId);
      server = lp.server;
      key = lp.key;
      ts = lp.ts;
      console.log('[vk-longpoll] connected, ts=' + ts);
    } catch (err) {
      console.error('[vk-longpoll] getLongPollServer failed:', err.message);
      await sleep(RESTART_DELAY_MS);
      continue;
    }

    while (true) {
      try {
        const data = await poll(server, key, ts);

        if (data.failed === 1) {
          ts = data.ts;
          continue;
        }
        if (data.failed === 2 || data.failed === 3) {
          console.log('[vk-longpoll] reconnecting (failed=' + data.failed + ')');
          break;
        }

        ts = data.ts;

        if (data.updates && data.updates.length > 0) {
          for (const update of data.updates) {
            if (update.type === 'message_new' && update.object?.message) {
              const msg = update.object.message;
              console.log('[vk-longpoll] message_new from peer_id=' + msg.peer_id);
              handleVkIncomingMessage(prisma, msg, update.object).catch((e) =>
                console.error('[vk-longpoll] handler error:', e)
              );
            }
          }
        }
      } catch (err) {
        console.error('[vk-longpoll] poll error:', err.message);
        await sleep(RESTART_DELAY_MS);
        break;
      }
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
