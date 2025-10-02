# check if yamnet.tflite file exists
if [ ! -f yamnet.tflite ]; then
    echo "yamnet.tflite not found, downloading..."
    wget https://github.com/Universite-Gustave-Eiffel/Rail4Earth/releases/download/static_files/yamnet.tflite
else
    echo "yamnet.tflite already present."
fi

python3 src/yamnetgui/zero_trigger.py --yamnet_class_map src/yamnetgui/resources/yamnet_class_threshold_map_fr.csv --yamnet_weights yamnet.tflite --yamnet_max_gain 3 --yamnet_cutoff_frequency 200
