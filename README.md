# 도파민 나무 (AI-X 2팀)

긍정적인 도파민 활동을 하면 씨앗에 물을 주고 나무로 키우는 앱입니다.

- 활동: 산책(GPS), 일기, 명상(클래식 음악), 독서(독후감), 수면
- 인증된 활동마다 물을 받아 나무가 자라고, 오래 활동하지 않으면 나무가 시듭니다.

## 실행 방법

[Node.js](https://nodejs.org/)(LTS)를 설치하고, 휴대폰에 **Expo Go** 앱(Play 스토어/App Store)을 설치한 뒤:

```bash
cd src
npm install
npx expo start
```

터미널에 나오는 QR 코드를 Expo Go 앱(아이폰은 카메라 앱)으로 찍으면 휴대폰에서 앱이 실행됩니다.
컴퓨터와 휴대폰이 같은 Wi-Fi에 연결되어 있어야 합니다.

테스트: `npm test` / 타입 검사: `npm run typecheck`

## 문서

- 주차별 활동지: `week-01.md` ~ `week-07.md`
- 아키텍처와 작업 규칙: `CLAUDE.md`
- 개인정보 판단 기록: `ETHICS.md`
