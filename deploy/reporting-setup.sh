#!/usr/bin/env bash
# Lucerne Boutique — open a read-only reporting door to the database.
#
#   sudo bash deploy/reporting-setup.sh <database-name> <allowed-ip> [more-allowed-ips...]
#
# What it does, in order:
#   1. creates the "report" views and the read-only login "lucerne_report" (reporting-readonly.sql)
#   2. asks you to type a password for that login (it is never shown or stored in a file)
#   3. lets PostgreSQL accept connections from outside, but ONLY for that login, ONLY to this
#      database, ONLY from the IP addresses you list, and ONLY over an encrypted connection
#   4. opens port 5432 in the firewall (ufw) for those IP addresses only
#   5. restarts PostgreSQL
#
# To undo everything later:  sudo bash deploy/reporting-setup.sh --remove <database-name>
set -euo pipefail

ROLE="lucerne_report"
MARK="# lucerne-report"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then echo "Run this with sudo."; exit 1; fi
as_pg() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 "$@"; }

HBA="$(as_pg -Atc 'show hba_file')"

if [[ "${1:-}" == "--remove" ]]; then
  DB="${2:?database name}"
  sed -i "/${MARK}\$/d" "$HBA"
  as_pg -d "$DB" -c "DROP SCHEMA IF EXISTS report CASCADE" || true
  as_pg -d "$DB" -c "REVOKE CONNECT ON DATABASE \"$DB\" FROM $ROLE" || true
  as_pg -c "DROP ROLE IF EXISTS $ROLE" || true
  if command -v ufw >/dev/null 2>&1; then
    # delete every rule that mentions the reporting comment
    while ufw status numbered | grep -q "lucerne-report"; do
      n="$(ufw status numbered | grep "lucerne-report" | head -1 | sed -E 's/^\[ *([0-9]+)\].*/\1/')"
      yes | ufw delete "$n" >/dev/null
    done
  fi
  systemctl reload postgresql
  echo "Removed: the report views, the login, the access rules and the firewall rules."
  echo "PostgreSQL still listens on all addresses; to close that too:"
  echo "  sudo -u postgres psql -c \"ALTER SYSTEM RESET listen_addresses\" && sudo systemctl restart postgresql"
  exit 0
fi

DB="${1:?Usage: sudo bash deploy/reporting-setup.sh <database-name> <allowed-ip> [more-ips...]}"
shift
if [[ $# -lt 1 ]]; then
  echo "Give at least one IP address that is allowed to connect (the reporting service's addresses)."
  exit 1
fi
for ip in "$@"; do
  if ! [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$ ]]; then echo "Not an IPv4 address: $ip"; exit 1; fi
done

echo "1/5  Creating the report views and the read-only login in database \"$DB\"..."
as_pg -d "$DB" -q -f "$HERE/reporting-readonly.sql" >/dev/null

echo "2/5  Choose a password for the reporting login (at least 16 characters; use a password generator)."
while true; do
  read -r -s -p "     Password: " PW; echo
  read -r -s -p "     Again:    " PW2; echo
  if [[ "$PW" != "$PW2" ]]; then echo "     They do not match. Try again."; continue; fi
  if [[ ${#PW} -lt 16 ]]; then echo "     Too short. Use at least 16 characters."; continue; fi
  break
done
as_pg -q -v pw="$PW" <<'SQL'
SET password_encryption = 'scram-sha-256';
ALTER ROLE lucerne_report PASSWORD :'pw';
SQL
unset PW PW2

echo "3/5  Allowing only that login, only from the listed addresses, only encrypted..."
sed -i "/${MARK}\$/d" "$HBA"
for ip in "$@"; do
  [[ "$ip" == */* ]] || ip="$ip/32"
  printf 'hostssl %s %s %s scram-sha-256 %s\n' "$DB" "$ROLE" "$ip" "$MARK" >> "$HBA"
done
as_pg -q -c "ALTER SYSTEM SET listen_addresses = '*'"
as_pg -q -c "ALTER SYSTEM SET ssl = on"

echo "4/5  Firewall..."
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  for ip in "$@"; do ufw allow from "$ip" to any port 5432 proto tcp comment "lucerne-report" >/dev/null; done
  echo "     ufw: port 5432 opened for the listed addresses only."
else
  echo "     ufw is not active on this server. If your hosting panel has its own firewall,"
  echo "     open TCP port 5432 there for the listed addresses ONLY (never for everyone)."
fi

echo "5/5  Restarting PostgreSQL..."
systemctl restart postgresql
sleep 2
as_pg -Atc "select 'PostgreSQL is running, listening on: ' || current_setting('listen_addresses')"

PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
cat <<EOF

Done. Use these in the connection form:
  host        $PUBLIC_IP
  port        5432
  database    $DB
  user        $ROLE
  password    (the one you just typed)
  schema      report
  table_name  products      (then add stock, sales and returns the same way)

Everyone else on the internet is still refused, and this login can only read the report views.
EOF
