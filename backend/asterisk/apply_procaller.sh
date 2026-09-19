#!/bin/bash
set -e
python3 - <<'PY'
from pathlib import Path

def clean_and_add(path, include_line, match):
    p = Path(path)
    lines = p.read_text().splitlines()
    lines = [ln for ln in lines if match not in ln]
    lines.append(include_line)
    p.write_text("\n".join(lines) + "\n")

clean_and_add("/etc/asterisk/pjsip.conf", '#include "pjsip_procaller.conf"', "pjsip_procaller")
clean_and_add("/etc/asterisk/extensions.conf", '#include "extensions_procaller.conf"', "extensions_procaller")
clean_and_add("/etc/asterisk/manager.conf", '#include "manager_procaller.conf"', "manager_procaller")
print("includes updated")
PY
echo "--- verify ---"
grep procaller /etc/asterisk/pjsip.conf /etc/asterisk/extensions.conf /etc/asterisk/manager.conf
asterisk -rx "core set verbose 3"
asterisk -rx "module load res_pjsip_transport_websocket.so" || true
tail -n 20 /var/log/asterisk/full
asterisk -rx "core reload"
sleep 2
asterisk -rx "pjsip show endpoints"
asterisk -rx "dialplan show procaller-agent"
asterisk -rx "manager show user procaller"
asterisk -rx "pjsip show transports"
