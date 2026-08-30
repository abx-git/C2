#!/bin/bash
cd "$(dirname "$0")" || exit 1
/bin/bash "./setup.sh"
status=$?
echo
if [ "$status" -ne 0 ]; then
  echo "Setup nicht abgeschlossen (Status $status)."
fi
read -r -p "Taste zum Schließen… " _ || true
exit "$status"
