#!/usr/bin/env python3
"""Reconvertit YAMNet en modèle TFLite à entrée fixe pour la version navigateur.

Le modèle d'origine (../yamnet.tflite côté serveur Python) a une entrée
dynamique que tfjs-tflite ne sait pas redimensionner dans le navigateur.
On repart du SavedModel YAMNet officiel et on le convertit avec une entrée
fixe de 15360 échantillons (0,96 s à 16 kHz), identique au fenêtrage du jeu.

Prérequis (à faire une seule fois, avec Internet) :
    python3 -m venv .venv-tools
    .venv-tools/bin/pip install tensorflow kagglehub

Usage :
    .venv-tools/bin/python tools/convert_model.py

Le résultat est écrit dans ../yamnet.tflite (écrase le modèle existant).
"""

import os
import sys

WINDOW_SAMPLES = 15360  # 0,96 s à 16 kHz (voir config.json -> server.yamnet_window_seconds)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "yamnet.tflite"))


def main():
    import kagglehub
    import tensorflow as tf

    saved_model_dir = kagglehub.model_download("google/yamnet/TensorFlow2/yamnet/1")
    print("SavedModel :", saved_model_dir)

    model = tf.saved_model.load(saved_model_dir)

    @tf.function(input_signature=[tf.TensorSpec([WINDOW_SAMPLES], tf.float32, name="waveform")])
    def fixed(x):
        return model(x)

    concrete = fixed.get_concrete_function()
    converter = tf.lite.TFLiteConverter.from_concrete_functions([concrete], fixed)
    converter.optimizations = []
    tflite_model = converter.convert()

    with open(OUT, "wb") as f:
        f.write(tflite_model)

    interpreter = tf.lite.Interpreter(model_path=OUT)
    print("Écrit :", OUT)
    print("Entrée :", interpreter.get_input_details()[0]["shape"])
    print("Sortie :", interpreter.get_output_details()[0]["shape"])


if __name__ == "__main__":
    sys.exit(main())
