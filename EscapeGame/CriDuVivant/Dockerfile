FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY escape_game ./escape_game
COPY yamnet.tflite ./
WORKDIR /app/escape_game
EXPOSE 8765
CMD ["python", "server.py"]
