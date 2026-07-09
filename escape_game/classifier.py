import csv
import math
import os

import numpy as np


class YamnetClassifier:
    def __init__(self, model_path, max_gain=24.0, cutoff_frequency=0):
        import tensorflow.lite as tflite

        self.sample_rate = 16000
        self.max_gain = max_gain
        self.cutoff_frequency = cutoff_frequency

        self.interpreter = tflite.Interpreter(model_path=model_path)
        input_details = self.interpreter.get_input_details()
        self.waveform_input_index = input_details[0]["index"]
        output_details = self.interpreter.get_output_details()
        self.scores_output_index = output_details[0]["index"]

        csv_path = os.path.join(os.path.dirname(__file__), "yamnet_class_threshold_map.csv")
        if not os.path.exists(csv_path):
            csv_path = "/home/aumond/Documents/github/demonstrateur_escape_game/src/yamnetgui/resources/yamnet_class_threshold_map.csv"
        self.class_names = self._load_class_names(csv_path)

        self.sos = None
        if cutoff_frequency > 0:
            from scipy import signal
            self.sos = signal.butter(4, cutoff_frequency / (self.sample_rate / 2.0),
                                     btype="high", output="sos")

    @staticmethod
    def _load_class_names(csv_path):
        names = []
        with open(csv_path) as f:
            reader = csv.reader(f)
            next(reader)
            for row in reader:
                names.append(row[2])
        return np.array(names)

    def _preprocess(self, samples):
        if self.sos is not None:
            from scipy import signal
            samples = np.array(signal.sosfilt(self.sos, samples), dtype=np.float32)

        if self.max_gain > 0:
            max_value = max(1e-12, float(np.max(np.abs(samples))))
            max_gain = 20 * math.log10(1 / max_value)
            gain = min(self.max_gain, max_gain)
            samples *= 10 ** (gain / 20.0)
        return samples

    def predict(self, audio_samples):
        samples = np.asarray(audio_samples, dtype=np.float32).flatten()
        samples = self._preprocess(samples)

        self.interpreter.resize_tensor_input(self.waveform_input_index,
                                             [len(samples)], strict=True)
        self.interpreter.allocate_tensors()
        self.interpreter.set_tensor(self.waveform_input_index, samples)
        self.interpreter.invoke()
        scores = self.interpreter.get_tensor(self.scores_output_index)

        prediction = np.max(scores, axis=0)
        return dict(zip(self.class_names, [float(v) for v in prediction]))
