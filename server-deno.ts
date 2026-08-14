/**
 * TASKFLOW · хранилище общей доски команды.
 * Вариант для Deno Deploy: вход через GitHub, хранилище встроенное,
 * настраивать отдельно ничего не нужно. Один файл, ничего не устанавливать.
 *
 * Договор с приложением:
 *   GET  /board             -> {rev, state}         прочитать доску
 *   PUT  /board  {rev,state}-> {rev}                записать, если rev совпал
 *                           -> 409 {rev,state}      если кто-то успел раньше
 *   Заголовок X-Board-Key   -> общий пароль команды
 *
 * Пароль задаётся переменной окружения TEAM_KEY в настройках проекта.
 * Если её не задать, доска будет открыта всем, кто знает адрес.
 */

// База подключается в настройках приложения: Databases -> Attach Database -> Deno KV.
// Пока она не подключена, приложение всё равно поднимается и внятно об этом говорит,
// иначе первая сборка падала бы на прогреве с невнятной ошибкой.
let kv: Deno.Kv | null = null;
let kvError = "";
try {
  kv = await Deno.openKv();
} catch (e) {
  kvError = e instanceof Error ? e.message : String(e);
  console.error("Deno KV не подключён:", kvError);
}
const SLOT = ["taskflow", "board"];

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Board-Key",
  "Access-Control-Max-Age": "86400",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
  });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

  if (!kv) {
    return json({
      error: "Хранилище не подключено. В настройках приложения открой вкладку Databases, " +
        "нажми Attach Database и подключи базу Deno KV, затем перезапусти сборку. " +
        "Подробность: " + kvError,
    }, 503);
  }

  const teamKey = Deno.env.get("TEAM_KEY");
  if (teamKey && request.headers.get("X-Board-Key") !== teamKey) {
    return json({ error: "wrong key" }, 401);
  }

  const entry = await kv.get<{ rev: number; state: unknown }>(SLOT);
  const saved = entry.value ?? { rev: 0, state: null };

  if (request.method === "GET") return json(saved);

  if (request.method === "PUT") {
    let body: { rev?: unknown; state?: unknown };
    try { body = await request.json(); }
    catch { return json({ error: "bad json" }, 400); }
    if (typeof body.rev !== "number" || !body.state) {
      return json({ error: "need {rev,state}" }, 400);
    }
    // кто-то записал раньше: отдаём свежую доску, приложение сольёт и повторит
    if (body.rev !== saved.rev) return json(saved, 409);

    const next = { rev: saved.rev + 1, state: body.state, at: Date.now() };
    // атомарная запись: если между чтением и записью влез другой запрос, вернём 409
    const res = await kv.atomic().check(entry).set(SLOT, next).commit();
    if (!res.ok) return json(await kv.get(SLOT).then((e) => e.value ?? saved), 409);

    return json({ rev: next.rev });
  }

  return json({ error: "method not allowed" }, 405);
});
