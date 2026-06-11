#!/bin/bash
while true; do
  STATUS=$(gh pr checks || true)
  if echo "$STATUS" | grep -q "fail"; then
    echo "Checks failed!"
    exit 1
  fi
  if echo "$STATUS" | grep -q "pending"; then
    echo "Checks still pending... waiting 10s"
    sleep 10
  else
    echo "Checks passed, merging!"
    gh pr merge --admin --rebase
    exit 0
  fi
done
