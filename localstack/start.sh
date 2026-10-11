#!/bin/bash
# Start the local test stack (test harness only). Paths are for the sandbox used to build this project.
S=${STACK_DIR:-/tmp/claude-0/-home-claude/03490a9a-6aff-57f0-9815-055fac09ad44/scratchpad/stack}
HERE=$(cd "$(dirname "$0")" && pwd)
SITE=${SITE_DIR:-/tmp/sddc-site-build}
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/pgtest/data -o '-p 54322 -k /tmp -c listen_addresses=127.0.0.1' -l /var/lib/pgtest/pg.log start" >/dev/null 2>&1
sleep 2
cd "$S" && . ./env.sh
(nohup ./auth serve > gotrue.log 2>&1 &)
(nohup ./postgrest pgrst.conf > pgrst.log 2>&1 &)
(nohup python3 /tmp/smtp_sink.py > /tmp/smtp.log 2>&1 &)
cd "$HERE" && ln -sfn /home/claude/scratch-npm/node_modules node_modules
(JWT_SECRET=$JWT_SECRET SITE_DIR=$SITE nohup node gateway.mjs > /tmp/gateway.log 2>&1 &)
(cd /home/claude/src/Sri_Danvantari_Dental_Care_Website_Implemented/Sri_Danvantari_Dental_Care && nohup python3 -m http.server 8090 --bind 127.0.0.1 > /tmp/orig.log 2>&1 &)
sleep 3
curl -s 127.0.0.1:9999/health >/dev/null && echo "auth up"; curl -s -o /dev/null -w "rest %{http_code}\n" 127.0.0.1:3000/
