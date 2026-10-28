# 도파민 나무 (AI-X 2팀)

긍정적인 도파민 활동(산책, 일기, 명상, 독서, 충분한 수면)을 하면 씨앗에 물을 주고 나무로 키우는 모바일 앱.
일정 기간 활동하지 않으면 나무가 시든다.

## 저장소 구조

- `week-NN.md`: 주차별 팀 활동지 (명세·설계·이슈의 원본)
- `src/`: Flutter 앱
- `ETHICS.md`: 개인정보·윤리 관련 판단 기록
- `PROMPTS_*.md`: AI 협업 기록

## 실행

```bash
cd src
flutter create .        # 처음 한 번: android/ios 플랫폼 폴더 생성 (lib/는 덮어쓰지 않음)
flutter pub get
flutter run
flutter test
```

## 아키텍처: 3계층

의존 방향은 표현 → 로직 → 데이터, 한 방향만 허용한다. `test/architecture_test.dart`가 이를 검사한다.

| 계층 | 폴더 | 모듈 | 의존하지 않는 것 |
|---|---|---|---|
| 표현 | `lib/presentation/` | `ActivityScreen`, `TreeScreen`, `HistoryScreen` | 인증 규칙, 성장·시듦 규칙, 데이터 출처 |
| 로직 | `lib/logic/` | `ActivityVerifier`, `WateringEngine`, `WiltingChecker`, `StatsService`, `ReminderService` | 화면 종류, 저장 방식, 푸시 서비스 종류 |
| 데이터 | `lib/data/` | `LocationRepository`, `LocalStore`, `ActivityRepository`, `TreeRepository`, `PushClient` | 인증 규칙, 성장·시듦 규칙, 화면 구성 |

- 활동 인증 규칙(산책 거리·속도, 명상 중 조작, 독후감 분량)은 `ActivityVerifier` 안에만 둔다.
- `WateringEngine`은 "인증된 활동 1건"만 받는다. 어떤 활동인지 몰라도 된다.
- `WiltingChecker`는 물주기와 실행 시점·변경 이유가 달라 별도 모듈이다.
- DB 종류, 푸시 서비스 종류는 데이터 계층 구현 안에 숨긴다. 로직 계층은 추상 클래스만 안다.

## 활동 인증 규칙 (수치는 팀에서 확정 전)

- 산책: GPS로 거리·시간 계산. 평균 시속 7km 초과는 인정하지 않음 (차량 이동 방지)
- 일기: 작성하면 인정
- 명상: 정해진 클래식 음악이 끝까지 재생되는 동안 다른 조작이 없으면 인정
- 독서: 독후감을 기준 분량(예: 200자) 이상 쓰면 인정
- 수면: 취침·기상 시각 기준 시간 이상이면 인정
- 시듦: 마지막 인증 후 기준 기간(예: 3일) 경과 시 시듦, 하루 전 경고 푸시

## 개인정보 원칙

- GPS 경로 좌표, 일기·독후감 본문은 기기에만 저장한다. 서버로 보내지 않는다.
- 서버에는 결과만 올린다 (예: "산책 2.1km, 35분, 인증됨", "독후감 작성, 312자").

## 작업 규칙

- 이슈 단위로 작업한다. 이슈 목록은 `week-07.md` 참고.
- 브랜치: `종류/이슈번호-요약` (예: `feature/3-gps-walk`, `chore/1-project-setup`)
- 커밋: `#이슈번호 요약` (예: `#3 GPS 산책 거리 계산 추가`)
- PR 본문에 `Closes #이슈번호`를 써서 merge 시 이슈를 닫는다.
- 한 이슈에서 다른 계층·모듈을 고쳐야 하면 먼저 팀에 공유한다.
