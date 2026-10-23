#!/usr/bin/env bash
# Пуска регресиите на вградената снимка и съседните проверки, една по една, и печата
# последните два реда на всяка (числата и PASS/FAIL).
cd "$(dirname "$0")/../.." || exit 1
TESTS="inline-image-menu inline-image-preview-menu type8-inline-image type8-inline-image-offline modal-attachment-tiles attachment-tooltip-meta attachment-image-resilience token-refresh-401 board-format-pipe note-header-datemod-toggle settings-advanced-local-rows settings-modal-width onetap-persist md-link-render img-bgrd-default-off"
total_pass=0; total_fail=0; bad=""
for t in $TESTS; do
  start=$(date +%s)
  out=$(node ".bolter/check/$t.mjs" 2>&1)
  code=$?
  secs=$(( $(date +%s) - start ))
  summary=$(printf '%s\n' "$out" | grep -E '^[0-9]+/[0-9]+ проверки минават|^ALL PASS|^[0-9]+ FAILED' | tr '\n' ' ')
  if [ $code -eq 0 ]; then
    total_pass=$((total_pass+1))
    printf 'PASS %-32s %6ss  %s\n' "$t" "$secs" "$summary"
  else
    total_fail=$((total_fail+1)); bad="$bad $t"
    printf 'FAIL %-32s %6ss  %s\n' "$t" "$secs" "$summary"
    printf '%s\n' "$out" | grep -E '^FAIL' | head -12 | sed 's/^/       /'
  fi
done
echo "----"
echo "дървета: PASSED=$total_pass FAILED=$total_fail  паднали:$bad"
[ $total_fail -eq 0 ]
