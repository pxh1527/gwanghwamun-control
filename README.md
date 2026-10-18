# 광화문 점령전 V4.2 (Edge 최적화)

브라우저 3D 게임 시제품입니다. 4개 진영, 점령, NPC, HP/기력/배고픔, 차량, 전광판, 제작 도구와 멀티플레이 서버를 포함합니다.

## 실행

Node.js 20+ 환경에서 `ADMIN_PASSWORD` 환경변수에 고유한 12자 이상 비밀번호를 지정하고 `npm start` 실행 후 `http://localhost:3000` 접속.

## Edge 성능 개선

- 기본 자동 해상도 조절, FPS에 따른 동적 렌더 배율
- 상세 NPC 거리 제한, 원거리 NPC GPU 인스턴스 LOD
- 정적 사물 카메라 컬링, Edge 안티앨리어싱/화면 블러 감소
- FPS 및 draw call 표시

실제 Edge 하드웨어에서 FPS를 검증하지 못했으므로 60FPS를 보장하지 않습니다. 게임의 렌더링에 Three.js CDN의 인터넷 연결이 필요합니다.

## 배포

Render에 이 저장소를 Web Service로 연결해 `node server.js`를 실행하고, `ADMIN_PASSWORD`를 **Render 환경변수**로 입력하세요. 비밀번호를 코드에 커밋하지 마세요. GitHub Pages만 사용하면 실시간 멀티플레이 및 관리자 기능은 지원되지 않습니다.

정식 서비스 전에 모니터링, WAF, 채팅 관리와 권한 검증, 영구 DB, 실제 사용자 환경에서 부하 테스트가 필요합니다.
