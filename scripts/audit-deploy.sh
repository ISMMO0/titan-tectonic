#!/usr/bin/env bash
# Read-only security & cost audit of the Titan Cloud Run deployment (run in Cloud Shell).
#   bash scripts/audit-deploy.sh
# Changes nothing. Never prints secret values (only names / states).
set -uo pipefail
REGION="${REGION:-europe-west1}"; SERVICE="${SERVICE:-titan}"
PROJECT_ID="$(gcloud config get-value project 2>/dev/null)"
h() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }

h "Cloud Run service"
gcloud run services describe "$SERVICE" --region="$REGION" --format='value(
  status.url,
  spec.template.spec.serviceAccountName,
  spec.template.metadata.annotations."autoscaling.knative.dev/minScale",
  spec.template.metadata.annotations."autoscaling.knative.dev/maxScale",
  spec.template.spec.containerConcurrency,
  spec.template.spec.containers[0].resources.limits.memory)' | tr '\t' '\n' |
  paste -d' ' <(printf '%s\n' "url:" "service account:" "min instances:" "max instances:" "concurrency:" "memory:") -

h "Env vars (names only) and secret references"
gcloud run services describe "$SERVICE" --region="$REGION" --format=json |
  python3 -c '
import json,sys
c=json.load(sys.stdin)["spec"]["template"]["spec"]["containers"][0]
for e in c.get("env",[]):
    if "valueFrom" in e:
        r=e["valueFrom"]["secretKeyRef"]; print(f"  {e[\"name\"]} = <secret {r[\"name\"]}:{r[\"key\"]}>")
    else:
        v=e.get("value",""); secretish=any(k in e["name"] for k in ("KEY","SECRET","TOKEN","PASSWORD"))
        print(f"  {e[\"name\"]} = " + ("<PLAIN VALUE — should be a secret!>" if secretish and v else v))'

h "Who can invoke the service"
gcloud run services get-iam-policy "$SERVICE" --region="$REGION" --format='table(bindings.role,bindings.members)'

h "Secret gemini-api-key versions (states only)"
gcloud secrets versions list gemini-api-key --format='table(name,state,createTime)' 2>/dev/null
gcloud secrets get-iam-policy gemini-api-key --format='table(bindings.role,bindings.members)' 2>/dev/null

h "Project roles of the runtime service account"
SA="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')"
gcloud projects get-iam-policy "$PROJECT_ID" --flatten=bindings --filter="bindings.members:serviceAccount:${SA}" \
  --format='value(bindings.role)' | sed 's/^/  /'

h "API keys in the project (names/restrictions only)"
gcloud services api-keys list --format='table(displayName,restrictions.apiTargets[].service.list())' 2>/dev/null

h "Requests in the last 6 h by HTTP status"
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE} AND httpRequest.status>0" \
  --freshness=6h --limit=2000 --format='value(httpRequest.status)' 2>/dev/null | sort | uniq -c | sort -rn | head

h "Errors in the last 6 h (first line only)"
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE} AND severity>=ERROR" \
  --freshness=6h --limit=20 --format='value(textPayload)' 2>/dev/null | grep -v '^\s*at ' | cut -c1-140 | sort | uniq -c | sort -rn | head

h "Leak check: key-like strings in recent logs"
n="$(gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE}" \
  --freshness=24h --limit=2000 --format='value(textPayload)' 2>/dev/null | grep -cE 'AIza[0-9A-Za-z_-]{20}|AQ\.[A-Za-z0-9_-]{20}|sb_secret_' || true)"
echo "  lines with key-like strings: ${n:-0} (expect 0)"
echo; echo "Audit done (nothing was changed)."
