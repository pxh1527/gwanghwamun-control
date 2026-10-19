# 광화문 점령전 V5.6 — 웹 접속용

이 버전은 Three.js를 실행 시 CDN에서 불러오지 않고 GitHub Actions에서 게임 코드와 3D 엔진을 묶습니다. GLB 파일도 웹사이트와 함께 게시합니다.

## 웹사이트 활성화
1. GitHub 저장소 → Settings → Pages에서 Source를 GitHub Actions로 설정합니다.
2. Actions → Build and deploy game의 build / deploy 결과를 확인합니다.
3. Settings → Pages에 표시된 주소를 Edge에서 새 탭으로 엽니다.

GitHub Pages는 **1인 체험용 정적 웹사이트**입니다. 실제 멀티플레이나 관리자 API는 Node.js 서버(별도 호스팅)가 있어야 합니다. GitHub Pages를 활성화하지 않으면 공개 게임 URL이 아직 없습니다. 실제 Edge 동작 및 GPU 성능은 설치 환경에서 추가 검증이 필요합니다.
