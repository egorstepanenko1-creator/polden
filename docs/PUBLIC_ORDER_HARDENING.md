# Hardening публичного заказа

Минимальные **application-level** меры для `POST /api/public/delivery-orders/quote` и `POST /api/public/delivery-orders`. Инфраструктурный WAF / edge rate limit по-прежнему рекомендованы.

## Что добавлено

1. **Content-Type** — для двух POST выше требуется заголовок, содержащий `application/json`; иначе **415** (`UNSUPPORTED_MEDIA_TYPE`).
2. **Rate limiting** — in-memory по IP (`req.ip`; за прокси включите **`POLDEN_TRUST_PROXY=1`**). Ответ **429** (`RATE_LIMIT`), заголовок `Retry-After` (секунды).
3. **Honeypot** — поле **`polden_hp`** в теле заказа: должно быть пустым; иначе **400** (`SPAM_REJECTED`). На лендинге `project/landing-order/index.html` — скрытое поле.
4. **Длины полей** — сервер отклоняет чрезмерно длинные `customerName`, `address`, `comment`, сырую строку телефона (см. лимиты в `backend/src/publicOrderGuards.js`).
5. **Payload** — лимит тела JSON по-прежнему **256kb** (`express.json`).
6. **CORS** — в **production-like** режиме только явно заданные origin’ы; в обычной локальной разработке — разрешён reflect (`origin: true`).
7. **Старт в production-like** — проверка секретов и CORS (ниже).

## Чего это не решает

- Не заменяет **CAPTCHA**, полноценный **бот-скоринг**, распределённый rate limit и защиту от **ботнетов с множеством IP**.
- In-memory лимиты **сбрасываются при рестарте** и **не шарятся** между инстансами.
- Не ограничивает **GET** `/api/public/branches`, `/api/public/menu-day` (вне scope этой задачи).

## Rate limit

- Реализация: **`backend/src/publicOrderGuards.js`** (`createPublicOrderRateLimit`) — **без новых npm-зависимостей**.
- Отдельные счётчики для quote и create (разные ключи `pub-quote` / `pub-create`).

| Переменная | Назначение | По умолчанию |
|------------|------------|--------------|
| `PUBLIC_ORDER_RATE_WINDOW_MS` | Окно, мс | `60000` |
| `PUBLIC_ORDER_QUOTE_RATE_MAX` | Макс. запросов на IP за окно (quote) | `45` |
| `PUBLIC_ORDER_CREATE_RATE_MAX` | Макс. запросов на IP за окно (create) | `25` |

## Honeypot

- Имя поля: **`polden_hp`**.
- Легитимный клиент (лендинг) отправляет пустую строку.
- Пример ответа при заполнении: HTTP **400**, тело `{ "ok": false, "error": { "message": "Запрос отклонён", "code": "SPAM_REJECTED" } }`.

## CORS

- Пакет: существующий **`cors`** (уже в `package.json`), обёртка **`backend/src/corsConfig.js`** — **новых зависимостей нет**.
- **Не production-like** (`NODE_ENV` не `production` и нет `POLDEN_PRODUCTION_LIKE=1`): `origin: true`, `credentials: true` — удобно для localhost и Vite.
- **Production-like**: разрешены только origin’ы из списка:
  - если задан **`POLDEN_CORS_ORIGINS`** — **только** он (через запятую), без смешивания с другими env;
  - иначе — объединение `PUBLIC_SITE_ORIGIN`, `CRM_FRONTEND_ORIGIN`, `CRM_FRONTEND_ORIGINS` (последняя может содержать несколько значений через запятую).

При production-like без ни одного origin процесс **не стартует** (см. `configStartup.js`).

## Секреты и production-like режим

Считается production-like, если **`NODE_ENV=production`** или **`POLDEN_PRODUCTION_LIKE=1`**.

| Требование | Поведение |
|------------|-----------|
| `CRM_INTERNAL_TOKEN` | Обязателен, не пустой; значение **`dev`** запрещено, кроме **`POLDEN_ALLOW_DEV_CRM_TOKEN=1`**. |
| `VK_WEBHOOK_SECRET` | Обязателен; пустой только с **`POLDEN_ALLOW_EMPTY_VK_WEBHOOK_SECRET=1`** (с предупреждением в логе). |
| CORS origins | Как в разделе выше — хотя бы один источник в конфиге. |

В обычном dev при пустом `VK_WEBHOOK_SECRET` webhook не проверяет secret (как раньше); в лог пишется предупреждение из `warnWeakDevConfig()`.

## Локальная разработка

- Не выставляйте `POLDEN_PRODUCTION_LIKE=1`, если не готовы задать CORS и секреты как в проде.
- Backend: `cd CRM/crm-mvp/backend && npm run dev`.
- Лендинг: открыть `project/landing-order/index.html` или статический хост; API по умолчанию `http://localhost:4000/api`.

## CAPTCHA (задел)

Интеграция **не включена**. Для будущего внедрения достаточно проверки токена на сервере до `createDeliveryOrderFromInput` и опционального env-флага режима; поле honeypot и rate limit остаются базовым слоем.

## Известные ограничения

- Лимиты хранятся в **памяти процесса**.
- Ключ rate limit — **IP**; за NAT пользователи делят квоту.
- `CRM_INTERNAL_TOKEN` в dev по умолчанию **`dev`** — только для локальной разработки.
