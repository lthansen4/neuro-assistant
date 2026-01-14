#!/bin/bash
cd /Users/lindsayhansen/Desktop/App\ Builds/college-exec-functioning/neuro-assistant
npx tsx scripts/cron-nudge-scanner.ts >> /tmp/nudge-scanner.log 2>&1
