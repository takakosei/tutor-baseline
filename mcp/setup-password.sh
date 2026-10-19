#!/bin/bash
# Sets the sign-in password for the Claude Desktop assistant (mcp/server.mts). Run from the repository folder:
#   mcp/setup-password.sh <your sign-in email>
# What it does: generates a strong random password → stores it in the macOS Keychain → sets it on your Supabase
# account → tries one sign-in.
# The password is never printed, written to a file or committed. Running it again = a new password (the old one stops working).
set -euo pipefail
cd "$(dirname "$0")/.."
EMAIL="${1:?Usage: mcp/setup-password.sh <your sign-in email>}"
SERVICE="tutor-baseline-mcp"

# 36 random characters plus one upper-case letter, lower-case letter, digit and symbol: passes any password rule in the Auth settings
PW="$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-36)Aa1!"
security add-generic-password -U -s "$SERVICE" -a "$EMAIL" -w "$PW"
echo "✓ Password stored in the Keychain (service ${SERVICE})"

if ! TUTOR_EMAIL="$EMAIL" TUTOR_PW="$PW" node --env-file=.env.local --input-type=module -e '
import { createClient } from "@supabase/supabase-js"
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data, error } = await admin.auth.admin.listUsers()
if (error) throw error
const user = data.users.find((u) => u.email?.toLowerCase() === process.env.TUTOR_EMAIL.toLowerCase())
if (!user) { console.error("✗ No Supabase account with this email"); process.exit(1) }
const { error: e } = await admin.auth.admin.updateUserById(user.id, { password: process.env.TUTOR_PW })
if (e) throw e
console.log("✓ Password set on the Supabase account")

const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { error: le } = await c.auth.signInWithPassword({ email: process.env.TUTOR_EMAIL, password: process.env.TUTOR_PW })
if (le) { console.error("✗ Test sign-in failed: " + le.message); process.exit(1) }
const { count } = await c.from("students").select("id", { count: "exact", head: true })
console.log(`✓ Test sign-in succeeded; ${count} students visible`)
'; then
  echo
  echo "✗ Not finished: see the error above. The Keychain password and the account password do not match; fix the problem and run this script again."
  exit 1
fi
unset PW

printf 'TUTOR_EMAIL=%s\n' "$EMAIL" > mcp/.env
echo "✓ Wrote mcp/.env (the email only; ignored by git)"
echo
echo "Next: add the assistant to Claude Desktop (see docs/assistant.md), then quit and reopen Claude Desktop."
