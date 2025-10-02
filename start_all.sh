# Activate the virtual environment
source .venv/bin/activate
# Start capture of audio samples from microphone
sh start_record.sh&
# Start analysis of audio samples
sh start_yamnet.sh&
# Launch graphical interface
python3 src/yamnetgui/gui.py
