# ZED Voice AI

Aplikasi web privat untuk membuat narasi suara menggunakan model [OmniVoice](https://github.com/k2-fsa/OmniVoice).

## Arsitektur

- Antarmuka web statis disajikan oleh Cloudflare Worker.
- Worker menerima rekaman WAV dan naskah, lalu menyimpannya ke bucket R2 privat.
- Worker memicu GitHub Actions dengan job ID acak (tanpa mengirim teks atau audio ke GitHub).
- GitHub Actions menjalankan OmniVoice pada CPU dan mengunggah hasil WAV ke R2.
- Worker menampilkan status dan mengalirkan hasil audio ke pengguna yang sudah login.

Audio, naskah, transkrip, dan hasil suara tidak boleh dimasukkan ke repository publik.

## Yang sudah ada di repository

- `public/index.html` — aplikasi web responsif, rekam mikrofon, upload WAV, input naskah, status, pemutar dan unduh audio.
- `worker/index.js` — API privat untuk upload, dispatch workflow, status, dan download.
- `wrangler.toml` — konfigurasi Cloudflare Worker dan binding bucket R2.
- `.github/workflows/omnivoice.yml` — runner pemrosesan.
- `scripts/run_omnivoice.py` — inferensi OmniVoice dan penyimpanan hasil.

## 1. GitHub Actions secrets

Di repository GitHub, buka **Settings → Secrets and variables → Actions** dan buat:

| Secret | Nilai |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_BUCKET` | Nama bucket privat, misalnya `zed-voice-private` |
| `R2_ACCESS_KEY_ID` | R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Access Key |

Token R2 harus dibatasi pada bucket ini dengan izin Object Read & Write.

## 2. GitHub token untuk Worker

Buat GitHub Fine-grained Personal Access Token:
- Resource owner: akun pemilik repository.
- Repository access: Only select repositories → `zed-voice-ai`.
- Repository permissions: **Actions → Read and write**.

Simpan token tersebut sebagai Worker secret bernama `GITHUB_TOKEN`. Jangan masukkan token ke kode, repository, atau chat.

## 3. Deploy ke Cloudflare Workers

1. Buka Cloudflare Dashboard → **Workers & Pages**.
2. Pilih **Create application** → **Workers** → **Import a repository**.
3. Hubungkan GitHub dan pilih `mkhoirulzed-svg/zed-voice-ai`.
4. Atur build command menjadi `npx wrangler deploy`. Root directory gunakan root repository.
5. Deploy Worker.
6. Pada Worker → **Settings → Variables and Secrets**, tambahkan dua secret:
   - `GITHUB_TOKEN` — Fine-grained token dari langkah 2.
   - `APP_PASSWORD` — kata sandi kuat untuk membuka aplikasi.
7. Pastikan konfigurasi R2 binding `VOICE_BUCKET` mengarah ke bucket `zed-voice-private`. Konfigurasi ini sudah didefinisikan di `wrangler.toml`.
8. Setelah secret ditambahkan, lakukan redeploy bila diminta.

Worker menggunakan R2 binding langsung; API token R2 tidak perlu ditambahkan ke Worker. API token R2 tetap digunakan oleh GitHub Actions runner melalui GitHub Secrets.

## 4. Penggunaan

1. Buka URL Worker.
2. Masuk menggunakan `APP_PASSWORD`.
3. Rekam suara sendiri melalui mikrofon atau unggah WAV (maksimum 20 MB).
4. Masukkan naskah (maksimum 5.000 karakter).
5. Opsional: masukkan transkrip yang sama persis dengan rekaman referensi.
6. Klik **Generate suara**. Tunggu proses selesai, lalu dengarkan atau unduh WAV.

Rekaman referensi idealnya 3–10 detik, jelas, tanpa musik latar, dan menggunakan suara milik sendiri atau suara yang penggunaannya telah mendapat izin.

## Batasan saat ini

- Runner GitHub Actions menggunakan CPU, bukan GPU. Generasi dapat berjalan lambat; timeout workflow saat ini 45 menit.
- Model diunduh saat runner pertama kali berjalan.
- Aplikasi menunggu hasil melalui polling. Jika halaman ditutup, pekerjaan tetap berjalan dan status dapat diperiksa lagi setelah membuka aplikasi (fitur riwayat job belum dibuat).
- Versi awal menerima file WAV. Format lain perlu dikonversi ke WAV sebelum diunggah.
- Belum ada multi-user, kuota, maupun penghapusan otomatis objek lama. Lindungi URL Worker dan jangan membagikan kata sandi aplikasi.

## Lisensi

Periksa lisensi model dan bobot OmniVoice dari upstream sebelum penggunaan komersial. Gunakan hanya rekaman suara yang kamu miliki atau yang telah memberikan persetujuan eksplisit.
