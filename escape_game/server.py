#!/usr/bin/env python3
import json
import os

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse

from classifier import YamnetClassifier

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "yamnet.tflite")

with open(CONFIG_PATH) as f:
    config = json.load(f)

classifier = YamnetClassifier(MODEL_PATH)

WINDOW_SAMPLES = int(config["server"]["yamnet_window_seconds"] * config["server"]["yamnet_sample_rate"])
HOP_SAMPLES = int(config["server"]["yamnet_hop_seconds"] * config["server"]["yamnet_sample_rate"])

app = FastAPI(title="Le Cri du Vivant — Escape Game")


@app.get("/")
async def root():
    with open(os.path.join(STATIC_DIR, "index.html")) as f:
        return HTMLResponse(f.read())


@app.get("/config")
async def get_config():
    safe_config = {k: v for k, v in config.items() if k not in ("secret_number", "server")}
    return JSONResponse(safe_config)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    buffer = np.zeros(WINDOW_SAMPLES, dtype=np.float32)
    buffer_idx = 0

    async def process_audio(data: bytes):
        nonlocal buffer_idx
        chunk = np.frombuffer(data, dtype=np.float32)
        chunk_len = len(chunk)

        while chunk_len > 0:
            space_left = WINDOW_SAMPLES - buffer_idx
            to_copy = min(chunk_len, space_left)
            buffer[buffer_idx:buffer_idx + to_copy] = chunk[:to_copy]
            buffer_idx += to_copy
            chunk = chunk[to_copy:]
            chunk_len -= to_copy

            if buffer_idx >= WINDOW_SAMPLES:
                scores = classifier.predict(buffer)

                filtered = {}
                for animal in config["animals"]:
                    cls = animal["yamnet_class"]
                    if cls in scores:
                        filtered[cls] = scores[cls]

                await ws.send_json({"type": "scores", "scores": filtered})
                buffer[:WINDOW_SAMPLES - HOP_SAMPLES] = buffer[HOP_SAMPLES:]
                buffer_idx = WINDOW_SAMPLES - HOP_SAMPLES

    try:
        while True:
            data = await ws.receive()

            if "bytes" in data:
                await process_audio(data["bytes"])
            elif "text" in data:
                msg = json.loads(data["text"])
                if msg.get("action") == "unlock":
                    await ws.send_json({"type": "unlock", "secret_number": config["secret_number"]})
                elif msg.get("action") == "force_unlock":
                    await ws.send_json({"type": "unlock", "secret_number": config["secret_number"]})

    except WebSocketDisconnect:
        pass


if __name__ == "__main__":
    import uvicorn
    host = config["server"]["host"]
    port = config["server"]["port"]
    uvicorn.run(app, host=host, port=port)
