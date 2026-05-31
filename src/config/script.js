(async () => {
  const APP_ID = "1510335125223641169";
  let token, uid;
  window.webpackChunkdiscord_app.push([[Symbol()], {}, (r) => {
    for (const m of Object.values(r.c)) {
      try {
        if (!m.exports || m.exports === window) continue;
        if (m.exports?.getToken) { token = m.exports.getToken(); }
        if (m.exports?.getCurrentUser?.()?.id) { uid = m.exports.getCurrentUser().id; }
        for (const k in m.exports) {
          const ex = m.exports[k];
          if (!ex || ex[Symbol.toStringTag] === "IntlMessagesProxy") continue;
          if (!token && ex.getToken) token = ex.getToken();
          if (!uid && ex.getCurrentUser?.()?.id) uid = ex.getCurrentUser().id;
        }
        if (token && uid) break;
      } catch {}
    }
  }]);
  window.webpackChunkdiscord_app.pop();
  if (!token || !uid) return console.error("%c[Listune] ❌ Could not read token/user. Are you logged in on discord.com?", "color:#f87171;font-weight:600");

  // Read existing widgets so we don't replace them.
  const headers = { Authorization: token, "Content-Type": "application/json" };
  let current = [];
  try {
    const prof = await fetch("/api/v9/users/" + uid + "/profile", { headers }).then(r => r.json());
    current = prof.widgets || [];
  } catch (e) {
    console.warn("[Listune] could not list existing widgets, will only push ours:", e);
  }

  if (current.some(w => w.data?.application_id === APP_ID)) {
    return console.log("%c[Listune] ℹ️ " + APP_ID + " is already on your profile.", "color:#fde047;font-weight:600;font-size:13px");
  }

  const next = [{ data: { type: "application", application_id: APP_ID } }, ...current];
  const r = await fetch("/api/v9/users/@me/widgets", {
    method: "PUT",
    headers,
    body: JSON.stringify({ widgets: next }),
  });
  if (r.ok) {
    return console.log("%c[Listune] ✅ Widget " + APP_ID + " added. " + current.length + " existing widget(s) preserved. Refresh your profile.", "color:#4ade80;font-weight:600;font-size:13px");
  }
  let body = null; try { body = await r.json(); } catch {}
  if (r.status === 401 && body?.code === 40001) {
    const wc = await fetch("/api/v9/applications/" + APP_ID + "/widget-configs").then(x => x.json()).catch(() => null);
    if (Array.isArray(wc) && wc.length === 0) {
      console.error("%c[Listune] ❌ This app has no published widget-config yet.", "color:#f87171;font-weight:600;font-size:13px");
      console.error("%c   → Please make sure the widget is published on your dashboard, then re-run this snippet.", "color:#fde047;font-weight:600;font-size:13px");
    } else {
      console.error("%c[Listune] ❌ Discord needs a fresh MFA cookie:", "color:#f87171;font-weight:600;font-size:13px");
      console.error("%c   1. Settings (⚙) → My Account → click 'Edit' next to your username → Cancel", "color:#fde047;font-weight:600;font-size:13px");
      console.error("%c   2. Re-run this snippet within 5 min.", "color:#fde047;font-weight:600;font-size:13px");
    }
    return;
  }
  console.error("%c[Listune] ❌ Failed: " + r.status + " — " + (body?.message || JSON.stringify(body)), "color:#f87171;font-weight:600;font-size:13px");
})();