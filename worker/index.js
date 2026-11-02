const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function authorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(env.APP_PASSWORD && supplied && supplied === env.APP_PASSWORD);
}

function validId(id) {
  return /^[A-Za-z0-9_-]{8,80}$/.test(id);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!authorized(request, env)) return json({ error: "Akses ditolak. Masukkan kata sandi aplikasi." }, 401);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/api/jobs") {
      try {
        const form = await request.formData();
        const audio = form.get("reference");
        const text = String(form.get("text") || "").trim();
        const refText = String(form.get("ref_text") || "").trim();
        if (!(audio instanceof File) || !audio.size) return json({ error: "File audio WAV wajib diunggah." }, 400);
        if (audio.size > 20 * 1024 * 1024) return json({ error: "Ukuran audio maksimal 20 MB." }, 413);
        if (!audio.name.toLowerCase().endsWith(".wav")) return json({ error: "Gunakan file WAV." }, 400);
        if (!text || text.length > 5000) return json({ error: "Naskah harus berisi 1–5000 karakter." }, 400);
        if (refText.length > 1000) return json({ error: "Transkrip referensi maksimal 1000 karakter." }, 400);

        const jobId = crypto.randomUUID().replaceAll("-", "");
        const prefix = `jobs/${jobId}/`;
        await env.VOICE_BUCKET.put(prefix + "reference.wav", audio.stream(), { httpMetadata: { contentType: "audio/wav" } });
        await env.VOICE_BUCKET.put(prefix + "input.json", JSON.stringify({ text, ref_text: refText }), { httpMetadata: { contentType: "application/json" } });
        await env.VOICE_BUCKET.put(prefix + "status.json", JSON.stringify({ status: "queued" }), { httpMetadata: { contentType: "application/json" } });

        const dispatch = await fetch("https://api.github.com/repos/mkhoirulzed-svg/zed-voice-ai/actions/workflows/omnivoice.yml/dispatches", {
          method: "POST",
          headers: {
            "authorization": `Bearer ${env.GITHUB_TOKEN}`,
            "accept": "application/vnd.github+json",
            "content-type": "application/json",
            "x-github-api-version": "2022-11-28",
            "user-agent": "ZED-Voice-AI"
          },
          body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } })
        });
        if (!dispatch.ok) {
          await env.VOICE_BUCKET.put(prefix + "status.json", JSON.stringify({ status: "failed", error: "github_dispatch_failed" }));
          return json({ error: "GitHub Actions tidak dapat dijalankan. Periksa token dan izin Actions." }, 502);
        }
        return json({ job_id: jobId, status: "queued" }, 202);
      } catch (error) {
        return json({ error: "Permintaan gagal diproses: " + (error instanceof Error ? error.message : "unknown") }, 500);
      }
    }

    const match = url.pathname.match(/^\/api\/jobs\/([A-Za-z0-9_-]{8,80})(\/audio)?$/);
    if (request.method === "GET" && match) {
      const [, jobId, audioRoute] = match;
      if (!validId(jobId)) return json({ error: "Job ID tidak valid." }, 400);
      const prefix = `jobs/${jobId}/`;
      if (audioRoute) {
        const object = await env.VOICE_BUCKET.get(prefix + "output.wav");
        if (!object) return json({ error: "Audio belum tersedia." }, 404);
        return new Response(object.body, {
          headers: {
            "content-type": "audio/wav",
            "content-disposition": 'attachment; filename="zed-voice-output.wav"',
            "cache-control": "no-store"
          }
        });
      }
      const object = await env.VOICE_BUCKET.get(prefix + "status.json");
      if (!object) return json({ error: "Pekerjaan tidak ditemukan." }, 404);
      return new Response(object.body, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    return json({ error: "Endpoint tidak ditemukan." }, 404);
  }
};