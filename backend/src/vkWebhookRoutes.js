/**
 * VK Callback API — POST /api/vk/webhook (без CRM-токена; проверка VK_WEBHOOK_SECRET).
 *
 * confirmation — первым; для message_new с телом сообщения VK может не присылать secret — тогда не 403.
 */

import { randomUUID } from 'crypto';
import { Router } from 'express';
import { handleVkIncomingMessage } from './vkBotHandler.js';

const VK_WEBHOOK_ROUTE = 'POST /api/vk/webhook';

/**
 * Структурированная строка в stdout/stderr для прод-сбора логов (без секретов).
 * @param {Record<string, unknown>} payload
 */
function logVkWebhookStructured(level, payload) {
  const line = JSON.stringify({
    level,
    event: 'vk_webhook',
    ts: new Date().toISOString(),
    route: VK_WEBHOOK_ROUTE,
    ...payload
  });
  if (level === 'error') console.error(line);
  else console.warn(line);
}

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
    const requestIdRaw = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    const requestId =
      requestIdRaw != null && String(requestIdRaw).trim()
        ? String(requestIdRaw).trim().slice(0, 128)
        : randomUUID();

    try {
      const secretCfg = (process.env.VK_WEBHOOK_SECRET || '').trim();
      const body = req.body;
      if (!body || typeof body !== 'object') {
        logVkWebhookStructured('warn', {
          requestId,
          phase: 'reject_body',
          contentType: req.headers['content-type'] ?? null,
          errorMessage: 'body not object'
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
        logVkWebhookStructured('warn', {
          requestId,
          phase: 'message_new_without_secret',
          vkEventType: body.type,
          hasSecretField,
          incomingSecretPrefix: secretPrefixForLog(incomingSecret),
          expectedSecretPrefix: secretPrefixForLog(secretCfg),
          acceptedWithoutSecretFallback: true
        });
      } else {
        secretOk = incomingSecret === secretCfg;
      }

      if (!secretOk) {
        logVkWebhookStructured('warn', {
          requestId,
          phase: 'secret_mismatch_403',
          vkEventType: body.type,
          hasSecretField,
          incomingSecretPrefix: secretPrefixForLog(incomingSecret),
          expectedSecretPrefix: secretPrefixForLog(secretCfg),
          hasObjectMessage: Boolean(body.object?.message)
        });
        return res.status(403).send('forbidden');
      }

      if (diagVerbose) {
        console.log(
          JSON.stringify({
            level: 'info',
            event: 'vk_webhook',
            ts: new Date().toISOString(),
            route: VK_WEBHOOK_ROUTE,
            requestId,
            phase: 'accept',
            vkEventType: body.type,
            hasSecretField,
            secretMatch: true,
            hasObjectMessage: Boolean(body.object?.message),
            acceptedWithoutSecretFallback
          })
        );
      }

      res.type('text/plain').send('ok');

      if (body.type === 'message_new' && body.object?.message) {
        const msg = body.object.message;
        const peerId = msg.peer_id != null ? String(msg.peer_id) : null;
        const messageId = msg.conversation_message_id ?? msg.id ?? null;
        const fromId = msg.from_id != null ? String(msg.from_id) : null;
        if (diagVerbose) {
          console.log(
            JSON.stringify({
              level: 'info',
              event: 'vk_webhook',
              ts: new Date().toISOString(),
              route: VK_WEBHOOK_ROUTE,
              requestId,
              phase: 'handler_scheduled',
              vkEventType: 'message_new',
              peerId,
              messageId,
              fromId
            })
          );
        }
        setImmediate(() => {
          handleVkIncomingMessage(prisma, msg, body.object).catch((e) => {
            logVkWebhookStructured('error', {
              requestId,
              phase: 'message_handler_async',
              vkEventType: 'message_new',
              peerId,
              messageId,
              fromId,
              errorMessage: e instanceof Error ? e.message : String(e),
              stack: e instanceof Error ? e.stack : undefined
            });
          });
        });
      } else if (diagVerbose && body.type === 'message_new') {
        logVkWebhookStructured('warn', {
          requestId,
          phase: 'message_new_skipped_no_object_message',
          vkEventType: body.type
        });
      }
    } catch (e) {
      logVkWebhookStructured('error', {
        requestId,
        phase: 'request_sync_throw',
        errorMessage: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined
      });
      if (!res.headersSent) {
        return res.status(500).type('text/plain').send('error');
      }
    }
  });

  return r;
}
