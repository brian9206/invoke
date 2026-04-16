#!/bin/sh
meson setup build . --backend=ninja
ninja -C build