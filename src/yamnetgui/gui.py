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


from __future__ import annotations

import numpy as np
import matplotlib.ticker as mtick
import matplotlib.animation as animation
import matplotlib.pyplot as plt
import zmq


class ApplicationWindow:
    def __init__(self):
        super().__init__()
        self.socket = None
        self.init_socket()

        self.rng = np.random.default_rng(19680801)
        fig, self._dynamic_ax = plt.subplots(num="Reconnaissance de sources audio")
        # Set up a Line2D.
        self.tags = np.array([])
        self.scores = np.array([])
        self._update_data()
        self.container = self._dynamic_ax.barh(self.tags, self.scores)
        self.ani = animation.FuncAnimation(fig=fig, func=self._update_data, frames=40 ,interval=125)
        plt.show()

    def init_socket(self):
        context = zmq.Context()
        self.socket = context.socket(zmq.SUB)
        self.socket.connect("tcp://127.0.0.1:10003")
        self.socket.subscribe("")

    def _update_data(self, frame=None):
        # Fetch json from zero_trigger over local network
        try:
            json_data = self.socket.recv_json(flags=zmq.NOBLOCK)
            print(json_data)
            data = json_data["scores"]
            # Sort tags by score (descending)
            tags = sorted(data, key=data.get)[:6]
            if len(tags) == 0:
                return
            scores = [data[tag] for tag in tags]
            self.tags = tags
            self.scores = np.array(scores) * 100
            self._dynamic_ax.clear()
            self._dynamic_ax.barh(self.tags, self.scores)
            self._dynamic_ax.set_xlim(0, 100)
            self._dynamic_ax.set_xlabel('Score')
            self._dynamic_ax.xaxis.set_major_formatter(mtick.PercentFormatter())

        except zmq.ZMQError as e:
            # no data currently available
            pass


if __name__ == "__main__":
    # Check whether there is already a running QApplication (e.g., if running
    # from an IDE).
    app = ApplicationWindow()