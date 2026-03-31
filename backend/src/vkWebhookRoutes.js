/**
 * VK Callback API — POST /api/vk/webhook (без CRM-токена; проверка VK_WEBHOOK_SECRET).
 */

import { Router } from 'express';
import { handleVkIncomingMessage } from './vkBotHandler.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function createVkWebhookRouter(prisma) {
  const r = Router();

  r.post('/', (req, res) => {
    const secretCfg = (process.env.VK_WEBHOOK_SECRET || '').trim();
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).send('bad request');
    }
    if (secretCfg && String(body.secret ?? '').trim() !== secretCfg) {
      return res.status(403).send('forbidden');
    }

    if (body.type === 'confirmation') {
      const code = (process.env.VK_CALLBACK_CONFIRMATION_CODE || '').trim();
      return res.type('text/plain').send(code);
    }

    res.type('text/plain').send('ok');

    if (body.type === 'message_new' && body.object?.message) {
      const msg = body.object.message;
      setImmediate(() => {
        handleVkIncomingMessage(prisma, msg, body.object).catch((e) => console.error('[vk] handler', e));
      });
    }
  });

  return r;
}
