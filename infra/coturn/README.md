# TURN 서버 (coturn) 배포 가이드

셀룰러(통신사 CGNAT)와 사내 와이파이(대칭 NAT·방화벽) 사이에서는 STUN만으로
WebRTC P2P 연결이 성립하지 않는다. 이 디렉터리는 EC2에 TURN 중계 서버(coturn)를
띄우기 위한 설정이다. 프론트는 `VITE_TURN_URLS`가 설정돼 있으면 자동으로 TURN을
ICE 후보에 포함한다.

## 1. EC2 보안 그룹 인바운드 열기

| 포트 | 프로토콜 | 용도 |
| --- | --- | --- |
| 3478 | UDP | TURN (기본) |
| 3478 | TCP | TURN over TCP — UDP가 막힌 사내망 대비 |
| 49160–49200 | UDP | 미디어 중계 포트 범위 (`turnserver.conf`의 min/max-port) |

## 2. 배포

```bash
# 로컬에서: 이 디렉터리를 EC2로 복사
scp -r infra/coturn ubuntu@i15a504.p.ssafy.io:~/

# EC2에서: 공인/사설 IP 자동 설정 + 컨테이너 기동
ssh ubuntu@i15a504.p.ssafy.io
bash ~/coturn/setup.sh
```

도커가 없는 환경이면 `sudo apt install coturn` 후 `turnserver.conf`를
`/etc/turnserver.conf`로 복사하고 `sudo systemctl enable --now coturn`.
(이때 `external-ip`는 setup.sh의 sed 라인을 손으로 실행해 채운다.)

## 3. 동작 확인

[Trickle ICE 테스트 페이지](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)에서:

- STUN or TURN URI: `turn:i15a504.p.ssafy.io:3478`
- username: `bangbangbwa`, password: `turnserver.conf`의 `user=` 값
- Gather candidates 클릭 → **`relay` 타입 후보**가 나오면 성공

문제가 있으면 EC2에서 `docker compose logs -f coturn`으로 인증 실패·포트 바인딩
오류를 확인한다.

## 4. 프론트 설정 (frontend/.env)

```
VITE_TURN_URLS=turn:i15a504.p.ssafy.io:3478?transport=udp,turn:i15a504.p.ssafy.io:3478?transport=tcp
VITE_TURN_USERNAME=bangbangbwa
VITE_TURN_CREDENTIAL=<turnserver.conf의 user= 비밀번호와 동일>
```

`.env`는 git에 올라가지 않으므로 팀원에게 별도로 공유할 것.

## 참고

- 자격 증명(`user=`)을 바꾸면 `turnserver.conf`와 `frontend/.env` 양쪽을 함께
  바꿔야 한다. 이 저장소에 커밋된 비밀번호는 팀 외부에 공개되면 교체할 것.
- TCP 3478까지 막는 아주 엄격한 방화벽까지 대비하려면 TLS 인증서를 발급받아
  `turns:` (5349 또는 443)를 추가할 수 있다. 현재 프로젝트 범위에서는 UDP/TCP
  3478로 충분해 넣지 않았다.
- 세션당 대역폭은 `max-bps=1500000`(약 1.5Mbps)로 제한돼 있다. 화질이 부족하면
  이 값을 올린다.
