#!/usr/bin/env bash
# Déploiement prod — rebuild sans cache frontend pour forcer une nouvelle version.json
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env.prod ]]; then
  echo "Erreur: fichier .env.prod introuvable dans $(pwd)" >&2
  exit 1
fi

# Pour que TOUTE commande `docker compose` (même sans --env-file) lise les bonnes valeurs
if [[ ! -e .env ]] || [[ -L .env ]]; then
  ln -sfn .env.prod .env
fi

missing=()
for key in SMTP_USER SMTP_PASS NOTIFICATION_EMAILS; do
  val="$(grep -E "^${key}=" .env.prod | tail -1 | cut -d= -f2- || true)"
  if [[ -z "${val// }" ]]; then
    missing+=("$key")
  fi
done
if ((${#missing[@]})); then
  echo "Erreur: dans .env.prod, valeurs vides: ${missing[*]}" >&2
  exit 1
fi

echo "── Build (frontend sans cache Docker → nouveau APP_BUILD_ID) ──"
# --no-cache frontend : garantit un nouveau version.json à chaque déploiement
docker compose --env-file .env.prod -f docker-compose.prod.yml build --no-cache frontend
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build "$@"

docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy

echo "── Vérif SMTP dans le conteneur ──"
smtp_check="$(docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend \
  printenv NOTIFICATION_EMAILS SMTP_USER 2>/dev/null || true)"
echo "$smtp_check"
if ! echo "$smtp_check" | grep -q '@'; then
  echo "ERREUR: SMTP toujours vide dans le conteneur — vérifie docker-compose.prod.yml (env_file: .env.prod)" >&2
  exit 1
fi

echo "── Vérif anti-cache (version.json) ──"
ver="$(docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T frontend \
  wget -qO- http://127.0.0.1/version.json 2>/dev/null || true)"
echo "$ver"
if ! echo "$ver" | grep -q 'version'; then
  echo "ATTENTION: version.json introuvable dans le frontend — les navigateurs pourraient garder l’ancienne version." >&2
else
  echo "OK — nouvelle version déployée. Les navigateurs ouverts se mettront à jour sous ~20s (reload auto)."
fi

echo "OK — déploiement terminé."
