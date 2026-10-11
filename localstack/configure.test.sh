#!/bin/bash
# Checks that tools/configure.mjs accepts only public keys for the right project.
cd "$(dirname "$0")/../.."
b64(){ printf '%s' "$1" | base64 -w0 | tr '+/' '-_' | tr -d '='; }
jwt(){ echo "eyJhbGciOiJIUzI1NiJ9.$(b64 "$1").c2ln"; }
REF=abcdefghijklmnopqrst; URL=https://$REF.supabase.co
pass=0; fail=0
t(){ local want=$1 name=$2; shift 2; env -i PATH=$PATH "$@" node tools/configure.mjs --check >/dev/null 2>&1; local got=$?; if { [ $want = ok ] && [ $got = 0 ]; } || { [ $want = no ] && [ $got != 0 ]; }; then echo "PASS  $name"; pass=$((pass+1)); else echo "FAIL  $name"; fail=$((fail+1)); fi; }
t ok "accepts a publishable key"                 SUPABASE_URL=$URL SUPABASE_ANON_KEY=sb_publishable_AbC123_xyz
t ok "accepts a legacy anon JWT for the same project" SUPABASE_URL=$URL SUPABASE_ANON_KEY=$(jwt "{\"role\":\"anon\",\"ref\":\"$REF\"}")
t no "refuses a service_role JWT"                SUPABASE_URL=$URL SUPABASE_ANON_KEY=$(jwt "{\"role\":\"service_role\",\"ref\":\"$REF\"}")
t no "refuses a secret key (sb_secret_)"         SUPABASE_URL=$URL SUPABASE_ANON_KEY=sb_secret_abc
t no "refuses an anon key from a different project" SUPABASE_URL=$URL SUPABASE_ANON_KEY=$(jwt '{"role":"anon","ref":"zzzzzzzzzzzzzzzzzzzz"}')
t no "refuses http:// for a remote project"      SUPABASE_URL=http://$REF.supabase.co SUPABASE_ANON_KEY=sb_publishable_x
t no "refuses a URL with a path"                 SUPABASE_URL=$URL/rest/v1 SUPABASE_ANON_KEY=sb_publishable_x
t no "refuses missing values"                    SUPABASE_URL=$URL
echo "$pass passed, $fail failed"; [ $fail = 0 ]
