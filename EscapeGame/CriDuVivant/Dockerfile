FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY escape_game ./escape_game
RUN python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/Universite-Gustave-Eiffel/Rail4Earth/releases/download/static_files/yamnet.tflite', 'yamnet.tflite')"
WORKDIR /app/escape_game
EXPOSE 8765
CMD ["python", "server.py"]
