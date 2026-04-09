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

      function rubK(k) { return Math.round(Number(k || 0) / 100) + ' \u20bd'; }

      const soups  = menuItems.filter(i => i.position <= 2);
      const hots   = menuItems.filter(i => i.position >= 3 && i.position <= 4);
      const salads = menuItems.filter(i => i.position >= 5 && i.position <= 6);
      const extras = menuItems.filter(i => i.position >= 7);

      const dt = new Date(date + 'T12:00:00Z');
      const dateStr = dt.toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
      });

      const lines = ['\ud83c\udf7d \u041c\u0435\u043d\u044e \u043d\u0430 ' + dateStr, ''];

      if (soups.length) soups.forEach(i => lines.push('\ud83e\udd63 ' + i.name + ' \u2014 ' + rubK(i.price)));
      if (hots.length)  hots.forEach(i => lines.push('\ud83c\udf56 ' + i.name + ' \u2014 ' + rubK(i.price)));
      if (salads.length) salads.forEach(i => lines.push('\ud83e\udd57 ' + i.name + ' \u2014 ' + rubK(i.price)));
      if (extras.length) {
        lines.push('');
        lines.push('\u2795 \u0414\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u043e:');
        extras.forEach(i => lines.push('  ' + i.name + ' \u2014 ' + rubK(i.price)));
      }

      lines.push('');
      lines.push('\ud83d\udcf1 \u0417\u0430\u043a\u0430\u0437\u044b\u0432\u0430\u0439\u0442\u0435 \u0432 \u043b\u0438\u0447\u043d\u044b\u0445 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f\u0445 \u0433\u0440\u0443\u043f\u043f\u044b');
      lines.push('\u23f0 \u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430 \u0441 11:00 \u0434\u043e 13:00');

      const message = lines.join('\n');

      const params = new URLSearchParams({
        owner_id: '-' + groupId,
        message,
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
