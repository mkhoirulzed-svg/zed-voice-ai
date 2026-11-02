# ZED Voice AI

ZED Voice AI is an experimental, private-input voice-cloning workflow using
[k2-fsa/OmniVoice](https://github.com/k2-fsa/OmniVoice).

## Architecture

- This repository contains public source code and the GitHub Actions workflow.
- Reference recordings, scripts, transcripts, and generated audio belong in a
  **private Cloudflare R2 bucket**, never in this public repository.
- GitHub Actions downloads one job's private input, runs OmniVoice on a CPU
  runner, and uploads the WAV output and status back to R2.
- The workflow accepts only an opaque job ID. It does not put audio URLs,
  signed URLs, transcripts, or scripts into the public Actions event payload.

## Required GitHub Actions secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_BUCKET` | Private R2 bucket name |
| `R2_ACCESS_KEY_ID` | R2 access key with access only to this bucket |
| `R2_SECRET_ACCESS_KEY` | Matching R2 secret |

Keep the bucket private. Do not enable public bucket access.

## Private job object format

For a job ID such as `job_2026_001`, upload these objects to the bucket:

- `jobs/job_2026_001/input.json`
- `jobs/job_2026_001/reference.wav`

Example `input.json`:

```json
{
  "text": "Teks bahasa Indonesia yang ingin dibacakan.",
  "ref_text": "Transkrip yang sesuai dengan rekaman suara referensi."
}
```

Use a clean reference recording, ideally 3–10 seconds. The transcript must
match the recording. WAV is the expected reference format in this first version.

## Run the workflow

1. Open **Actions → ZED Voice AI - OmniVoice**.
2. Select **Run workflow**.
3. Enter the opaque job ID only.
4. After the run completes, retrieve:
   - `jobs/<job_id>/output.wav`
   - `jobs/<job_id>/status.json`

The repository currently provides the processing worker. A secure upload page
and job-dispatch backend are the next development step; do not put private
audio or signed URLs into GitHub issues, commits, workflow inputs, or logs.

## Runtime and limitations

- The first run downloads the OmniVoice model and may take several minutes.
- This workflow uses CPU inference; generation can be slow and may time out.
- Standard GitHub-hosted runners do not provide a GPU.
- Keep job IDs unguessable and delete input/output objects when no longer needed.
- Use only recordings you own or have explicit permission to clone.

## Model licensing

OmniVoice model weights and related assets have their own license terms. Review
the current [upstream repository](https://github.com/k2-fsa/OmniVoice) and model
card before commercial use. This project does not grant rights to the model or
to any voice recording.
