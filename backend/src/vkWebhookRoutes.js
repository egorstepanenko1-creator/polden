/**
 * VK Callback API — POST /api/vk/webhook (без CRM-токена; проверка VK_WEBHOOK_SECRET).
 *
 * confirmation — первым; для message_new с телом сообщения VK может не присылать secret — тогда не 403.
 */

import { Router } from 'express';
import { handleVkIncomingMessage } from './vkBotHandler.js';

/** Первые символы для сравнения в логах без утечки полного секрета. */
function secretPrefixForLog(value) {
  const t = String(value ?? '').trim();
  if (!t.length) return '(empty)';
  return `${t.slice(0, 4)}…(len=${t.length})`;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function createVkWebhookRouter(prisma) {
  const r = Router();

  r.post('/', (req, res) => {
    const secretCfg = (process.env.VK_WEBHOOK_SECRET || '').trim();
    const body = req.body;
    if (!body || typeof body !== 'object') {
      console.warn('[vk/webhook] reject: body not object', {
        contentType: req.headers['content-type']
      });
      return res.status(400).send('bad request');
    }

    if (body.type === 'confirmation') {
      const code = (process.env.VK_CALLBACK_CONFIRMATION_CODE || '').trim();
      return res.type('text/plain').send(code);
    }

    const hasSecretField = Object.prototype.hasOwnProperty.call(body, 'secret');
    const incomingSecret = String(body.secret ?? '').trim();
    const isMessageNewWithMessage = body.type === 'message_new' && Boolean(body.object?.message);
    const diagVerbose = process.env.VK_WEBHOOK_DIAGNOSTIC_LOG === '1';

    let secretOk;
    let acceptedWithoutSecretFallback = false;

    if (!secretCfg) {
      secretOk = true;
    } else if (isMessageNewWithMessage && incomingSecret.length === 0) {
      secretOk = true;
      acceptedWithoutSecretFallback = true;
      console.warn('[vk/webhook] message_new without secret — accepting for handler', {
        type: body.type,
        hasSecretField,
        incoming: secretPrefixForLog(incomingSecret),
        expected: secretPrefixForLog(secretCfg),
        secretMatch: false,
        hasObjectMessage: true,
        acceptedWithoutSecretFallback: true
      });
    } else {
      secretOk = incomingSecret === secretCfg;
    }

    if (!secretOk) {
      console.warn('[vk/webhook] reject: secret mismatch (403)', {
        type: body.type,
        hasSecretField,
        incoming: secretPrefixForLog(incomingSecret),
        expected: secretPrefixForLog(secretCfg),
        secretMatch: false,
        hasObjectMessage: Boolean(body.object?.message),
        acceptedWithoutSecretFallback: false
      });
      return res.status(403).send('forbidden');
    }

    if (diagVerbose) {
      console.log('[vk/webhook] accept', {
        type: body.type,
        hasSecretField,
        incoming: secretPrefixForLog(incomingSecret),
        expected: secretPrefixForLog(secretCfg),
        secretMatch: true,
        hasObjectMessage: Boolean(body.object?.message),
        acceptedWithoutSecretFallback
      });
    }

    res.type('text/plain').send('ok');

    if (body.type === 'message_new' && body.object?.message) {
      const msg = body.object.message;
      if (diagVerbose) {
        console.log('[vk/webhook] handler scheduled: message_new', { peer_id: msg.peer_id });
      }
      setImmediate(() => {
        handleVkIncomingMessage(prisma, msg, body.object).catch((e) => console.error('[vk] handler', e));
      });
    } else if (diagVerbose && body.type === 'message_new') {
      console.log('[vk/webhook] message_new without object.message — handler skipped');
    }
  });

  return r;
}
