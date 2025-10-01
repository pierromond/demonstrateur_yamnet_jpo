/usr/bin/arecord --buffer-time=125000 --disable-resample --disable-softvol -D $(arecord -L | grep -m1 plughw) -r 48000 -f FLOAT_LE -c 1 -t raw | python3 -u src/yamnetgui/zero_record.py



