#   ---------------------------------------------------------------------------------
#   Copyright (c) Microsoft Corporation. All rights reserved.
#   Licensed under the MIT License. See LICENSE in project root for information.
#   ---------------------------------------------------------------------------------
"""This is a Sample Python file."""


from __future__ import annotations
import sys
import time

import numpy as np
from matplotlib.backends.backend_qtagg import FigureCanvas
from matplotlib.backends.backend_qtagg import \
    NavigationToolbar2QT as NavigationToolbar
from matplotlib.backends.qt_compat import QtWidgets
from matplotlib.figure import Figure
import matplotlib.ticker as mtick
import matplotlib.animation as animation
import zmq
import json


class ApplicationWindow(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.socket = None
        self.init_socket()
        self._main = QtWidgets.QWidget()
        self.setCentralWidget(self._main)
        layout = QtWidgets.QVBoxLayout(self._main)

        dynamic_canvas = FigureCanvas(Figure(figsize=(5, 3)))
        layout.addWidget(dynamic_canvas)
        layout.addWidget(NavigationToolbar(dynamic_canvas, self))
        self.rng = np.random.default_rng(19680801)
        self._dynamic_ax = dynamic_canvas.figure.subplots()
        self._dynamic_ax.set_title(f'Reconnaissance de sources audio')
        # Set up a Line2D.
        self.tags = np.array([])
        self.scores = np.array([])
        self._update_data()
        self.container = self._dynamic_ax.barh(self.tags, self.scores)

        self.ani = animation.FuncAnimation(fig=dynamic_canvas.figure, func=self._update_data, frames=40 ,interval=125)

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
    qapp = QtWidgets.QApplication.instance()
    if not qapp:
        qapp = QtWidgets.QApplication(sys.argv)

    app = ApplicationWindow()
    app.show()
    app.activateWindow()
    app.raise_()
    qapp.exec()