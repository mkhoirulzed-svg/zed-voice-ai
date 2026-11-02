import json
import os
import re
import sys
import tempfile
from pathlib import Path

import boto3
import soundfile as sf
import torch
from omnivoice import OmniVoice

JOB_ID = os.environ["JOB_ID"]
if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", JOB_ID):
    raise SystemExit("Invalid job ID")

bucket = os.environ["R2_BUCKET"]
s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["R2_ENDPOINT_URL"],
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    region_name="auto",
)

prefix = f"jobs/{JOB_ID}"
def download(key: str, path: str) -> None:
    s3.download_file(bucket, f"{prefix}/{key}", path)

def upload_json(key: str, value: dict) -> None:
    s3.put_object(
        Bucket=bucket,
        Key=f"{prefix}/{key}",
        Body=json.dumps(value, ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
    )

try:
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        payload_path = tmpdir / "input.json"
        reference_path = tmpdir / "reference.wav"
        output_path = tmpdir / "output.wav"

        download("input.json", str(payload_path))
        download("reference.wav", str(reference_path))

        payload = json.loads(payload_path.read_text(encoding="utf-8"))
        text = payload.get("text", "").strip()
        ref_text = payload.get("ref_text", "").strip()

        if not text or len(text) > 5000:
            raise ValueError("Text must contain 1-5000 characters.")
        if len(ref_text) > 1000:
            raise ValueError("Reference transcript is too long.")

        upload_json("status.json", {"status": "processing"})

        # CPU runner: use float32 for broad compatibility.
        model = OmniVoice.from_pretrained(
            "k2-fsa/OmniVoice",
            device_map="cpu",
            dtype=torch.float32,
        )
        kwargs = {
            "text": text,
            "ref_audio": str(reference_path),
        }
        if ref_text:
            kwargs["ref_text"] = ref_text

        audio = model.generate(**kwargs)
        if not audio or len(audio[0]) == 0:
            raise RuntimeError("OmniVoice returned empty audio.")

        sf.write(str(output_path), audio[0], 24000, subtype="PCM_16")
        s3.upload_file(
            str(output_path),
            bucket,
            f"{prefix}/output.wav",
            ExtraArgs={"ContentType": "audio/wav"},
        )

    upload_json("status.json", {"status": "completed", "output_key": f"{prefix}/output.wav"})
except Exception as exc:
    # Keep the public Actions log free of payload text and credentials.
    upload_json("status.json", {"status": "failed", "error": type(exc).__name__})
    raise
