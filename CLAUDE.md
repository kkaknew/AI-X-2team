# 도파민 나무 (AI-X 2팀)

긍정적인 도파민 활동(산책, 일기, 명상, 독서, 충분한 수면)을 하면 씨앗에 물을 주고 나무로 키우는 모바일 앱.
일정 기간 활동하지 않으면 나무가 시든다.

## 저장소 구조

- `week-NN.md`: 주차별 팀 활동지 (명세·설계·이슈의 원본)
- `src/`: React Native(Expo, TypeScript) 앱
- `ETHICS.md`: 개인정보·윤리 관련 판단 기록
- `PROMPTS_*.md`: AI 협업 기록

## 실행

```bash
cd src
npm install
npx expo start      # 휴대폰의 Expo Go 앱으로 QR 코드를 찍어 실행
npm test            # 계층 규칙 + DB 스키마 테스트
npm run typecheck   # TypeScript 타입 검사
```

## 아키텍처: 3계층

의존 방향은 표현 → 로직 → 데이터, 한 방향만 허용한다. `src/__tests__/architecture.test.ts`가 이를 검사한다.

| 계층 | 폴더 | 모듈 | 의존하지 않는 것 |
|---|---|---|---|
| 표현 | `src/presentation/` | `TreeScreen`(메인), `ActivityScreen`, `RecordsScreen`, `CompletionScreen` | 인증 규칙, 성장·시듦 규칙, 데이터 출처 |
| 로직 | `src/logic/` | `ActivityVerifier`, `WateringEngine`, `WiltingChecker`, `StatsService`, `ReminderService` | 화면 종류, 저장 방식, 푸시 서비스 종류 |
| 데이터 | `src/data/` | `LocationRepository`, `LocalStore`, `ActivityRepository`, `TreeRepository`, `PushClient` | 인증 규칙, 성장·시듦 규칙, 화면 구성 |

- 활동 인증 규칙(산책 거리·속도, 명상 중 조작, 독후감 분량)은 `ActivityVerifier` 안에만 둔다.
- `WateringEngine`은 "인증된 활동 1건"만 받는다. 어떤 활동인지 몰라도 된다.
- `WiltingChecker`는 물주기와 실행 시점·변경 이유가 달라 별도 모듈이다.
- DB 종류, 푸시 서비스 종류는 데이터 계층 구현 안에 숨긴다. 로직 계층은 인터페이스만 안다.
- `App.tsx`는 계층을 조립하는 시작점이라 예외적으로 데이터 계층(DB 초기화)을 직접 부른다. 화면 파일은 그러면 안 된다.

## 화면 구성 (피그마 시안 반영)

- `App.tsx`의 `route`로 화면을 바꾼다: `main`(메인 나무) → `activity`(활동 5종) / `records`(내 기록) / `complete`(나무 완성)
- 메인 `TreeScreen`: 상태 카드·물 게이지, 나무 그림(다 자라면 열매 나무 `FruitTree`), 오늘 활동, 활동 고르기 시트, 열매 팝업 `FruitPopup`, 시듦 안내 창. ◀ ▶로 지난 나무를 본다
- 활동 화면은 `presentation/activity/`(`WalkScreen`, `MeditationScreen`, `WritingScreen`, `SleepScreen`)에 두고 `ActivityScreen`이 고른다
- `RecordsScreen`(내 기록)은 나의 나무 + `HistoryScreen`(기록 조회) + `ReminderScreen`(알림 설정) + `PastRecordsScreen`(지난 기록)을 한 화면에 모은다
- 화면에 보여줄 글자·수치 계산은 React 없이 테스트할 수 있게 `*View.ts`(`mainView`, `activityView`, `fruitView`, `historyView`, `treeHistoryView`)로 나눈다
- 공통 부품·색·글자 크기는 `presentation/ui/`(`theme.ts`가 시안 색 값). 색은 화면 파일에 직접 쓰지 않고 `theme.ts`에 이름을 붙여 쓴다
- 그림: 시안 SVG 원본은 `src/assets/design/`, 앱이 쓰는 문자열은 `node assets/design/build-svg-module.mjs`로 `presentation/ui/svgs.ts`를 만든다 (직접 고치지 않는다). 나무 그림은 단계마다 자라는 모습(`tree/1-seed.svg`~`5-tree.svg`)과 시든 모습(`tree/wilted-1-seed.svg`~`wilted-5-tree.svg`)이 있다
- 개발 중(`__DEV__`)에만 내 기록 아래에 체험용 기록 넣기·모두 지우기(`data/demoData.ts`, `DevToolsCard`)가 보인다

## 데이터 저장: 기기 내 SQLite

- 서버 DB는 쓰지 않는다. 모든 데이터는 휴대폰 안의 SQLite(`expo-sqlite`, 파일 `dopamine-tree.db`)에 저장한다.
- 스키마와 초기 데이터: `src/data/schema.ts`. 앱(`database.ts`)과 테스트(`__tests__/schema.test.ts`, Node 내장 `node:sqlite`)가 같은 SQL을 쓴다.
- 테이블 6개: `users`, `growth_stages`, `activity_types`, `trees`, `activity_logs`, `reminders`
- 활동별 인증 기준은 `activity_types.rule`(JSON)에 둔다. 판정은 `ActivityVerifier`가 이 값을 읽어서 한다.
- 스키마 변경은 `MIGRATIONS` 배열 끝에 새 SQL을 추가한다. 기존 항목은 고치지 않는다 (이미 설치된 앱은 `PRAGMA user_version`으로 적용 여부를 기억).
- 알림(리마인더, 시듦 경고)도 서버 푸시가 아니라 기기 로컬 알림으로 예약한다.
- 일기·독후감 본문(독후감은 책 제목 포함)은 앱 DB가 아니라 **개인 기록 DB**(`dopamine-tree-local.db`, 스키마 `src/data/localSchema.ts`, 접근 `LocalStore`)에만 저장한다. 앱 DB의 `activity_logs`에는 글자 수·인증 여부·받은 물만 남긴다. 나중에 앱 DB를 공유·동기화해도 개인 기록 DB는 내보내지 않는다.

## 활동 인증 규칙 (수치는 팀에서 확정 전)

- 산책: GPS로 거리·시간 계산. 평균 시속 7km 초과는 인정하지 않음 (차량 이동 방지)
- 일기: 작성하면 인정. **물은 하루(휴대폰 날짜) 한 번, 1만** 준다. 같은 날 두 번째 일기부터는 저장·인증만 하고 물은 0 (`ActivityRecorder.recordDiary`가 `activity_logs`로 확인)
- 명상: 정해진 클래식 음악이 끝까지 재생되는 동안 다른 조작이 없으면 인정
- 독서: 독후감을 기준 분량(200자) 이상 쓰면 인정. **물은 하루(휴대폰 날짜) 한 번, 1만** 준다. 200자 미만이어도 저장은 하고 인증만 안 한다. 같은 날 두 번째 독후감부터는 저장·인증만 하고 물은 0 (`ActivityRecorder.recordReading`이 `activity_logs`로 확인)
- 수면: 취침·기상 시각 기준 시간 이상이면 인정. **하루(일어난 날짜, 휴대폰 시간대) 한 번만 기록**하고 물은 **1** 준다. 같은 날 두 번째 수면은 기록하지 않는다 (`ActivityRecorder.recordSleep`이 `activity_logs`로 확인)
- 시듦: 마지막으로 물을 받은 시각(없으면 심은 시각)부터 **3일**(`WILT_AFTER_DAYS`)이 지나면 `wilted`. 앱을 켤 때·앞으로 가져올 때·물을 받았을 때 `WiltingChecker.check()`로 판정한다. 시든 나무가 물을 받으면 `WateringEngine`이 `growing`으로 되돌린다. 시들기 하루 전 기기 로컬 알림 1개(`ReminderService.syncWiltWarning` → `PushClient.scheduleOnce`)

## 개인정보 원칙

- 지금은 서버가 없어 모든 데이터가 기기에만 저장된다.
- 나중에 공유·동기화 기능을 넣더라도 GPS 경로 좌표, 일기·독후감 본문은 기기 밖으로 보내지 않는다. 결과만 보낸다 (예: "산책 2.1km, 35분, 인증됨", "독후감 작성, 312자").

## 작업 규칙

- 이슈 단위로 작업한다. 이슈 목록은 `week-07.md` 참고.
- 브랜치: `종류/이슈번호-요약` (예: `feature/3-gps-walk`, `chore/1-project-setup`)
- 커밋: `#이슈번호 요약` (예: `#3 GPS 산책 거리 계산 추가`)
- PR 본문에 `Closes #이슈번호`를 써서 merge 시 이슈를 닫는다.
- 한 이슈에서 다른 계층·모듈을 고쳐야 하면 먼저 팀에 공유한다.
