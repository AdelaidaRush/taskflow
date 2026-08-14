/**
 * TASKFLOW · хранилище общей доски команды.
 * Cloudflare Worker плюс KV. Бесплатного тарифа хватает с большим запасом:
 * доска обменивается данными раз в восемь секунд на человека.
 *
 * Договор с приложением:
 *   GET  /board            -> {rev, state}            прочитать доску
 *   PUT  /board {rev,state}-> {rev}                   записать, если rev совпал
 *                          -> 409 {rev,state}         если кто-то успел раньше
 *   Заголовок X-Board-Key  -> общий пароль команды
 *
 * Установка описана в README.md, раздел «Живая синхронизация».
 * Нужны две вещи: переменная TEAM_KEY и KV-хранилище с именем BOARD.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Board-Key',
  'Access-Control-Max-Age': '86400',
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // общий пароль команды: без него доску не прочитать и не записать
    if (env.TEAM_KEY && request.headers.get('X-Board-Key') !== env.TEAM_KEY) {
      return json({ error: 'wrong key' }, 401);
    }

    const slot = 'board';                       // одна доска на команду
    const raw = await env.BOARD.get(slot);
    const saved = raw ? JSON.parse(raw) : { rev: 0, state: null };

    if (request.method === 'GET') return json(saved);

    if (request.method === 'PUT') {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: 'bad json' }, 400); }
      if (!body || typeof body.rev !== 'number' || !body.state) {
        return json({ error: 'need {rev,state}' }, 400);
      }
      // кто-то записал раньше: возвращаем свежую доску, приложение сольёт и повторит
      if (body.rev !== saved.rev) return json(saved, 409);

      const next = { rev: saved.rev + 1, state: body.state, at: Date.now() };
      await env.BOARD.put(slot, JSON.stringify(next));
      return json({ rev: next.rev });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
