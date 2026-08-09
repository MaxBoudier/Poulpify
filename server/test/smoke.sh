#!/bin/bash
# Vérification fonctionnelle du serveur Poulpify sans Spotify réel.
# Usage : npm test  (depuis server/), ou bash test/smoke.sh
set -u
B=http://127.0.0.1:3999
fail=0

STATE_DIR=$(mktemp -d)
export STATE_DIR
node "$(dirname "$0")/fake-spotify-server.js" > "$STATE_DIR/server.log" 2>&1 &
SERVER_PID=$!
cleanup() { kill $SERVER_PID 2>/dev/null; rm -rf "$STATE_DIR"; }
trap cleanup EXIT
for _ in $(seq 1 40); do
  curl -sf $B/api/status > /dev/null 2>&1 && break
  sleep 0.25
done
check() { # nom, attendu, obtenu
  if [ "$2" = "$3" ]; then echo "  OK   $1"; else echo "  FAIL $1 (attendu=$2 obtenu=$3)"; fail=1; fi
}

echo "== status initial =="
S=$(curl -s $B/api/status)
echo "  $S"
check "hostActive=false" "false" "$(echo $S | jq -r .hostActive)"
check "serverVersion" "2.0.0" "$(echo $S | jq -r .serverVersion)"

echo "== login mauvais mot de passe =="
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/host/login -H 'Content-Type: application/json' -d '{"password":"nope"}')
check "401" "401" "$C"

echo "== passagers presents avant login =="
curl -s -X POST $B/api/heartbeat -H 'Content-Type: application/json' -d '{"username":"Alice","emoji":"🎸"}' > /dev/null
curl -s -X POST $B/api/heartbeat -H 'Content-Type: application/json' -d '{"username":"Bob","emoji":"🥁"}' > /dev/null
H=$(curl -s -X POST $B/api/heartbeat -H 'Content-Type: application/json' -d '{"username":"Alice","emoji":"🎸"}')
check "2 passagers" "2" "$(echo $H | jq '.activeUsers | length')"

echo "== login force (ne doit PAS ejecter les passagers) =="
L=$(curl -s -X POST $B/api/host/login -H 'Content-Type: application/json' -d '{"password":"secret-test","force":true,"autoDisconnectEnabled":false}')
TOK=$(echo $L | jq -r .hostToken)
check "success" "true" "$(echo $L | jq -r .success)"
check "autoDisconnect off" "false" "$(echo $L | jq -r .autoDisconnectEnabled)"
H=$(curl -s -X POST $B/api/heartbeat -H 'Content-Type: application/json' -d '{"username":"Alice","emoji":"🎸"}')
check "passagers conserves apres force" "2" "$(echo $H | jq '.activeUsers | length')"

echo "== controle de lecture hote =="
check "pause sans token = 403" "403" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/api/host/player/pause)"
check "pause avec token" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/api/host/player/pause -H "Authorization: Bearer $TOK")"
check "next" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/host/player/next -H "Authorization: Bearer $TOK")"
check "previous" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/host/player/previous -H "Authorization: Bearer $TOK")"
check "seek" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/host/player/seek?position_ms=42000" -H "Authorization: Bearer $TOK")"
check "seek sans position = 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/api/host/player/seek -H "Authorization: Bearer $TOK")"
check "volume 50" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/host/player/volume?volume_percent=50" -H "Authorization: Bearer $TOK")"
check "volume 150 = 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/host/player/volume?volume_percent=150" -H "Authorization: Bearer $TOK")"
check "repeat bogus = 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$B/api/host/player/repeat?state=bogus" -H "Authorization: Bearer $TOK")"
check "skip hote" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/host/skip -H "Authorization: Bearer $TOK")"
check "devices" "200" "$(curl -s -o /dev/null -w '%{http_code}' $B/api/host/devices -H "Authorization: Bearer $TOK")"

echo "== verrou de file =="
curl -s -X POST $B/api/toggle-lock -H "Authorization: Bearer $TOK" > /dev/null
check "queueLocked" "true" "$(curl -s $B/api/status | jq -r .queueLocked)"
check "invite bloque = 403" "403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/queue -H 'Content-Type: application/json' -d '{"uri":"spotify:track:x","username":"Alice"}')"
check "hote passe outre le verrou" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/queue -H 'Content-Type: application/json' -H "Authorization: Bearer $TOK" -d '{"uri":"spotify:track:x","username":"Poulpi"}')"
curl -s -X POST $B/api/toggle-lock -H "Authorization: Bearer $TOK" > /dev/null

echo "== attribution dans la file =="
curl -s -X POST $B/api/queue -H 'Content-Type: application/json' -d '{"uri":"spotify:track:t2","username":"Bob","emoji":"🥁"}' > /dev/null
sleep 0.4
Q=$(curl -s $B/api/player-queue)
check "addedBy=Bob" "Bob" "$(echo $Q | jq -r '.queue[] | select(.uri=="spotify:track:t2") | .addedBy')"
check "addedByEmoji" "🥁" "$(echo $Q | jq -r '.queue[] | select(.uri=="spotify:track:t2") | .addedByEmoji')"

echo "== SSE =="
timeout 6 curl -sN $B/api/events > /tmp/sse.txt &
SSEPID=$!
sleep 1
curl -s -X POST $B/api/toggle-lock -H "Authorization: Bearer $TOK" > /dev/null
sleep 2
kill $SSEPID 2>/dev/null
wait $SSEPID 2>/dev/null
N=$(grep -c '^data: ' /tmp/sse.txt)
if [ "$N" -ge 2 ]; then echo "  OK   SSE a diffuse $N evenements"; else echo "  FAIL SSE n'a diffuse que $N evenement(s)"; fail=1; fi
check "SSE contient passagers" "2" "$(grep '^data: ' /tmp/sse.txt | head -1 | sed 's/^data: //' | jq '.passengers | length')"
check "SSE contient player" "Fake Song" "$(grep '^data: ' /tmp/sse.txt | head -1 | sed 's/^data: //' | jq -r '.player.item.name')"
curl -s -X POST $B/api/toggle-lock -H "Authorization: Bearer $TOK" > /dev/null

echo "== logout ne detruit PAS la session Spotify =="
check "authentifie avant" "true" "$(curl -s $B/api/status | jq -r .authenticated)"
check "logout" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/host/logout -H "Authorization: Bearer $TOK")"
S=$(curl -s $B/api/status)
check "hostActive=false apres logout" "false" "$(echo $S | jq -r .hostActive)"
check "Spotify TOUJOURS authentifie" "true" "$(echo $S | jq -r .authenticated)"
H=$(curl -s -X POST $B/api/heartbeat -H 'Content-Type: application/json' -d '{"username":"Alice","emoji":"🎸"}')
check "passagers conserves apres logout" "2" "$(echo $H | jq '.activeUsers | length')"

echo "== deconnexion Spotify explicite =="
TOK2=$(curl -s -X POST $B/api/host/login -H 'Content-Type: application/json' -d '{"password":"secret-test"}' | jq -r .hostToken)
check "disconnect" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/host/spotify/disconnect -H "Authorization: Bearer $TOK2")"
check "Spotify oublie" "false" "$(curl -s $B/api/status | jq -r .authenticated)"

echo
if [ $fail -eq 0 ]; then echo "TOUS LES TESTS PASSENT"; else echo "DES TESTS ONT ECHOUE"; fi
exit $fail
