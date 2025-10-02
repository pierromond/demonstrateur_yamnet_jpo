#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
BSD 3-Clause License

Copyright (c) 2022, Université Gustave-Eiffel
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
"""
import argparse
import csv
import datetime
import json
import math
import os.path
import struct
import threading
import time
import types
from datetime import timezone

try:
    from importlib.resources import files
except ImportError:
    # Old python fallback
    from importlib_resources import files

from typing import List
import base64
import numpy as np
import resampy
import tflite_runtime.interpreter as tflite
import zmq


class Params:
    """
      Yamnet settings
    """
    sample_rate: float = 16000.0
    stft_window_seconds: float = 0.025
    stft_hop_seconds: float = 0.010
    mel_bands: int = 64
    mel_min_hz: float = 125.0
    mel_max_hz: float = 7500.0
    log_offset: float = 0.001
    patch_window_seconds: float = 0.96
    patch_hop_seconds: float = 0.48


class Tensors:
    cores_output_index = None
    embeddings_output_index = None
    spectrogram_output_index = None
    waveform_input_index = None
    scores_output_index = None

class StatusThread(threading.Thread):
    def __init__(self, trigger_processor, config):
        threading.Thread.__init__(self)
        self.trigger_processor = trigger_processor
        self.config = config

    def run(self):
        while self.config.running:
            record_time = str(datetime.timedelta(seconds=
                                                 round(
                                                     self.trigger_processor.total_read / self.config.sample_rate)))
            print("%s samples read: %ld (%s)" % (
            datetime.datetime.now().replace(microsecond=0).isoformat(),
            self.trigger_processor.total_read, record_time))
            time.sleep(self.config.delay_print_samples)


def read_yamnet_class_and_threshold(class_map_csv):
    with open(class_map_csv) as csv_file:
        reader = csv.reader(csv_file)
        next(reader)  # Skip header
        names, threshold = zip(
            *[[display_name.strip(), float(threshold)] for _, _, display_name, threshold in reader])
        return np.array(names), np.array(threshold, dtype=float)


def compute_butter_highpass_coefficients(cutoff, fs, order=4):
    from scipy import signal
    return signal.butter(order, cutoff / (fs / 2.0), btype='high',
                         output='sos')


def epoch_to_elasticsearch_date(epoch):
    """
    strict_date_optional_time in elastic search format is
    yyyy-MM-dd'T'HH:mm:ss.SSSZ
    @rtype: string
    """
    return datetime.datetime.fromtimestamp(epoch, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class TriggerProcessor:
    """
    Service listening to zero_record and trigger sound recording according to pre-defined noise events
    """
    socket_out_recognition = None

    def __init__(self, config):
        self.frame_time = 0
        self.processing_time = 0
        self.config = config
        self.total_read = 0  # Total audio samples read
        self.sample_rate = self.config.sample_rate
        # 4 bytes for float
        sample_length = 4
        self.bytes_per_seconds = self.sample_rate * sample_length
        self.remaining_samples = 0
        self.last_fetch_trigger_info = 0
        self.epoch = datetime.datetime.fromtimestamp(0, tz=datetime.timezone.utc)
        self.socket = None
        self.yamnet_config = Params()
        tflite_path = self.config.yamnet_weights
        if self.config.verbose:
            print("Init yamnet interpreter..")
        self.yamnet_interpreter = tflite.Interpreter(model_path=tflite_path)
        if self.config.verbose:
            print("Init tensors..")
        self.tensors = Tensors()
        input_details = self.yamnet_interpreter.get_input_details()
        self.tensors.waveform_input_index = input_details[0]['index']
        output_details = self.yamnet_interpreter.get_output_details()
        self.tensors.scores_output_index = output_details[0]['index']
        self.tensors.embeddings_output_index = output_details[1]['index']
        self.tensors.spectrogram_output_index = output_details[2]['index']
        if self.config.verbose:
            print("Init tensors done")
        self.yamnet_samples = np.zeros((int(config.yamnet_window_time *
                                            self.yamnet_config.sample_rate)),
                                       dtype=np.float32)
        # where to place new samples
        self.yamnet_samples_index = 0
        yamnet_class_map = self.config.yamnet_class_map
        if yamnet_class_map is None:
            yamnet_class_map = files('yamnetmq.resources').joinpath('yamnet_class_threshold_map.csv')
        self.yamnet_classes = read_yamnet_class_and_threshold(yamnet_class_map)
        if self.config.yamnet_cutoff_frequency > 0:
            self.sos = compute_butter_highpass_coefficients(self.config.yamnet_cutoff_frequency,
                                                            self.yamnet_config.sample_rate)
        else:
            self.sos = None

    def butter_highpass_filter(self, waveform):
        from scipy import signal
        return np.array(signal.sosfilt(self.sos, waveform), dtype=np.float32)

    def init_socket(self):
        context = zmq.Context()
        self.socket = context.socket(zmq.SUB)
        self.socket.connect(self.config.input_address)
        self.socket.subscribe("")
        self.socket_out_recognition = context.socket(zmq.PUB)
        self.socket_out_recognition.bind(self.config.output_address_recognition)

    def process_tags(self, samples):
        # check for sound recognition tags
        # filter and normalize signal
        if self.config.yamnet_cutoff_frequency > 0:
            samples = self.butter_highpass_filter(samples)
        if self.config.yamnet_max_gain > 0:
            # apply gain
            max_value = max(1e-12, float(np.max(np.abs(samples))))
            max_gain = 20 * math.log10(1 / max_value)
            gain = min(self.config.yamnet_max_gain, max_gain)
            samples *= 10 ** (gain / 20.0)
        # Predict YAMNet classes.
        self.yamnet_interpreter.resize_tensor_input(
            self.tensors.waveform_input_index,
            [len(samples)], strict=True)
        self.yamnet_interpreter.allocate_tensors()
        self.yamnet_interpreter.set_tensor(self.tensors.waveform_input_index,
                                           samples)
        self.yamnet_interpreter.invoke()
        scores, embeddings, spectrogram = (
            self.yamnet_interpreter.get_tensor(self.tensors.scores_output_index),
            self.yamnet_interpreter.get_tensor(self.tensors.embeddings_output_index),
            self.yamnet_interpreter.get_tensor(self.tensors.spectrogram_output_index))
        return scores, embeddings, spectrogram

    def fetch_audio_data(self):
        time_bytes, audio_data_bytes = self.socket.recv_multipart()
        audio_data_samples = np.frombuffer(audio_data_bytes, dtype=np.single)
        self.frame_time = struct.unpack("d", time_bytes)[0]
        self.total_read += len(audio_data_samples)
        return audio_data_samples

    def generate_yamnet_document_tags(self, samples, tags: List[str], add_spectrogram: bool = False):
        """
        @param samples: Audio samples in 16khz sample rate
        @param tags: list of tags to include in the document
        @param add_spectrogram: add spectrogram in dictionary
        @return: dict
        """
        if len(tags) == len(self.yamnet_classes[0]):
            tags_indexes = np.arange(len(tags))
        else:
            tags_indexes = np.where(np.isin(self.yamnet_classes[0], tags))[0]
        if len(tags_indexes) == 0:
            print("No tags to process or tags not found in the yamnet list")
            return {}

        start = time.time()
        scores, embeddings, spectrogram = self.process_tags(samples)
        self.processing_time += time.time() - start

        # Take maximum found prediction (was avg in the ref)
        prediction = np.max(scores, axis=0)
        tags_over_threshold = tags_indexes[np.nonzero(self.yamnet_classes[1][tags_indexes] <= prediction[tags_indexes])]

        document = {
            "scores": dict(zip(self.yamnet_classes[0][tags_over_threshold],
                               [float(v) for v in
                                (prediction[tags_over_threshold] - self.yamnet_classes[1][tags_over_threshold])
                                / (1-self.yamnet_classes[1][tags_over_threshold])]))
        }

        if self.config.verbose:
            print(document)
            print("%s processed in %.3f seconds for "
                  "%.1f seconds of audio." %
                  (time.strftime("%Y-%m-%d %H:%M:%S"), self.processing_time,
                   len(samples) /
                   self.yamnet_config.sample_rate))
        self.processing_time = 0
        if add_spectrogram:
            document["spectrogram"] = base64.b64encode(
                spectrogram.astype(np.float16).
                tobytes()).decode("UTF-8")
        return document

    def run(self):
        self.init_socket()
        document = {}
        self.processing_time = 0
        while True:
            if self.config is not None:
                waveform = self.fetch_audio_data()
                deb = time.time()
                if self.config.sample_rate != self.yamnet_config.sample_rate:
                    # resample if necessary
                    waveform = resampy.resample(waveform,
                                                self.config.sample_rate,
                                                self.yamnet_config.sample_rate,
                                                filter=self.config.
                                                resample_method)
                len_to_extract = min(len(waveform), len(self.yamnet_samples) -
                                     self.yamnet_samples_index)
                start_index = self.yamnet_samples_index
                end_index = self.yamnet_samples_index + len_to_extract
                if len_to_extract < len(waveform):
                    waveform = waveform[:len_to_extract]
                self.yamnet_samples[start_index:end_index] = waveform
                self.yamnet_samples_index += len_to_extract
                self.processing_time += time.time() - deb
                if self.yamnet_samples_index < len(self.yamnet_samples):
                    # window is not complete so wait for more samples
                    continue
                self.yamnet_samples_index = 0  # reset index
                document = self.generate_yamnet_document_tags(
                    self.yamnet_samples, self.yamnet_classes[0], self.config.add_spectrogram)
                document["date"] = epoch_to_elasticsearch_date(self.frame_time)
                self.socket_out_recognition.send_json(document)
            time.sleep(0.05)

    def unix_time(self):
        return (datetime.datetime.now(timezone.utc) - self.epoch).total_seconds()


if __name__ == "__main__":
    required_actions = []
    parser = argparse.ArgumentParser(
        description='This program read audio stream from zeromq and publish noise events',
        formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    parser.add_argument("-c", "--configuration_file",
                        help="Provide json configuration file instead of arguments", default="",
                        type=str)
    parser.add_argument("--sample_rate", help="audio sample rate", default=48000, type=int)
    parser.add_argument("--resample_method", help="Resampling method as Yamnet is requiring 16 KHz",
                        default='kaiser_fast', type=str)
    parser.add_argument("--input_address", help="Address for zero_record samples",
                        default="tcp://127.0.0.1:10001")
    parser.add_argument("--output_address_recognition",
                        help="Address for publishing JSON of sound recognition",
                        default="tcp://*:10003")
    required_actions.append(parser.add_argument("--yamnet_class_map",
                                                help="Yamnet CSV path yamnet_class_threshold_map.csv",
                                                type=str))
    required_actions.append(parser.add_argument("--yamnet_weights",
                                                help="Yamnet .tflite model download at https://tfhub.dev/google/lite-model/yamnet/tflite/1",
                                                type=str))
    parser.add_argument("--yamnet_cutoff_frequency", help="Yamnet highpass filter frequency",
                        default=0, type=float)
    parser.add_argument("--yamnet_max_gain", help="Yamnet maximum gain in dB", default=24.0,
                        type=float)
    parser.add_argument("--yamnet_window_time", help="Sound source recognition time in seconds",
                        default=5.0,
                        type=int)
    parser.add_argument("--delay_print_samples",
                        help="Delay in second between each print of number of samples read",
                        default=0, type=float)
    parser.add_argument("--add_spectrogram",
                        help="Add spectrogram float16 array in base 64 in"
                             " json file", default=False, action="store_true")
    parser.add_argument("-v", "--verbose",
                        help="Print all messages", default=False, action="store_true")
    args = parser.parse_args()
    if not args.configuration_file:
        # no configuration file but configured with command line arguments
        # Set-up mandatory arguments
        for action in required_actions:
            action.required = True
        args = parser.parse_args()
    else:
        from pathlib import Path
        os.makedirs(Path.home() / ".noisesensor", exist_ok=True)
        home_config_path = Path.home() / ".noisesensor" / "zerotrigger_config.json"
        if home_config_path.exists():
            print("Load configuration file " + str(home_config_path))
            with open(home_config_path, "r") as fp:
                cfg = json.load(fp)
                args = types.SimpleNamespace(**(vars(args) | cfg))
        else:
            config_file_path = Path(args.configuration_file)
            os.symlink(config_file_path.absolute(), home_config_path)
            with open(config_file_path, "r") as fp:
                print("Load configuration file " + args.configuration_file)
                cfg = json.load(fp)
                args = types.SimpleNamespace(**(vars(args) | cfg))
    print("Configuration:\n" + json.dumps(vars(args),
                                          sort_keys=False, indent=2))
    trigger = TriggerProcessor(args)
    args.running = True
    status_thread = StatusThread(trigger, args)
    if args.delay_print_samples > 0:
        # run stats thread
        status_thread.start()
    try:
        trigger.run()
    finally:
        args.running = False
