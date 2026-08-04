#!/usr/bin/env bash
# EC2(i15a504.p.ssafy.io)에서 실행 — 공인/사설 IP를 채워 넣고 coturn을 띄운다.
# 사용법: 이 디렉터리(infra/coturn)를 EC2로 복사한 뒤  bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"

PUBLIC_IP=$(curl -fsS http://checkip.amazonaws.com)
PRIVATE_IP=$(hostname -I | awk '{print $1}')
echo "external-ip=${PUBLIC_IP}/${PRIVATE_IP} 로 설정합니다"

sed -i "s|^external-ip=.*|external-ip=${PUBLIC_IP}/${PRIVATE_IP}|" turnserver.conf

docker compose up -d
sleep 2
docker compose logs --tail 20 coturn
echo
echo "완료. EC2 보안 그룹에 3478/udp, 3478/tcp, 49160-49200/udp 인바운드가 열려 있는지 확인하세요."
