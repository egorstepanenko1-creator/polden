/**
 * POST /api/vk/publish-menu  { branchId, date }
 * Публикует меню на стену VK группы
 */
export function registerVkPublishMenuRoute(app, prisma, requireCrmToken) {
  app.post('/api/vk/publish-menu', requireCrmToken, async (req, res) => {
    try {
      const { branchId, date } = req.body;
      if (!branchId || !date) {
        return res.status(400).json({ ok: false, error: { code: 'MISSING_PARAMS', message: 'branchId and date required' } });
      }

      const token = (process.env.VK_GROUP_ACCESS_TOKEN || '').trim();
      const groupId = (process.env.VK_GROUP_ID || '').trim();
      const groupScreen = (process.env.VK_GROUP_SCREEN_NAME || '').trim();
      if (!token || !groupId) {
        return res.status(500).json({ ok: false, error: { code: 'VK_NOT_CONFIGURED', message: 'VK_GROUP_ACCESS_TOKEN or VK_GROUP_ID not set' } });
      }

      const menuItems = await prisma.menuDayItem.findMany({
        where: { branchId, date },
        orderBy: { position: 'asc' }
      });

      if (!menuItems.length) {
        return res.status(400).json({ ok: false, error: { code: 'EMPTY_MENU', message: 'Меню на эту дату пустое — сначала заполните его' } });
      }

      function rubK(k) { return Math.round(Number(k || 0) / 100) + ' ₽'; }

      const soups  = menuItems.filter(i => i.position <= 2);
      const hots   = menuItems.filter(i => i.position >= 3 && i.position <= 4);
      const salads = menuItems.filter(i => i.position >= 5 && i.position <= 6);
      const extras = menuItems.filter(i => i.position >= 7);

      const dt = new Date(date + 'T12:00:00Z');
      const dateStr = dt.toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
      });

      const lines = ['🍽 Меню на ' + dateStr, ''];

      if (soups.length)  soups.forEach(i  => lines.push('🥣 ' + i.name + ' — ' + rubK(i.price)));
      if (hots.length)   hots.forEach(i   => lines.push('🍖 ' + i.name + ' — ' + rubK(i.price)));
      if (salads.length) salads.forEach(i => lines.push('🥗 ' + i.name + ' — ' + rubK(i.price)));
      if (extras.length) {
        lines.push('');
        lines.push('➕ Дополнительно:');
        extras.forEach(i => lines.push('  ' + i.name + ' — ' + rubK(i.price)));
      }

      lines.push('');
      lines.push('⏰ Доставка с 11:00 до 13:00');

      const message = lines.join('\n');

      const params = new URLSearchParams({
        owner_id: '-' + groupId,
        message,
        // Кнопка действия "Написать сообществу" — открывает чат с ботом
        call_to_action: JSON.stringify({ type: 'open_community_messages' }),
        access_token: token,
        v: '5.131'
      });

      const vkRes = await fetch('https://api.vk.com/method/wall.post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      const vkJson = await vkRes.json().catch(() => null);

      if (!vkRes.ok || vkJson?.error) {
        console.error('[vk publish-menu] error', vkJson?.error);
        return res.status(502).json({
          ok: false,
          error: { code: 'VK_POST_FAILED', message: vkJson?.error?.error_msg || 'VK API error' }
        });
      }

      const postId = vkJson?.response?.post_id;
      const postUrl = 'https://vk.com/wall-' + groupId + '_' + postId;
      res.json({ ok: true, data: { postId, postUrl, message } });
    } catch (e) {
      console.error('/api/vk/publish-menu', e);
      res.status(500).json({ ok: false, error: { code: 'SERVER_ERROR', message: String(e.message || e) } });
    }
  });
}
