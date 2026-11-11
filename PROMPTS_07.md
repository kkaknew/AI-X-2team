# AI 협업 기록 / AI Collaboration Log

작성 원칙: 프롬프트 나열이 아니라 **판단 근거**를 남긴다.
Principle: record your **reasoning**, not just prompts.

사용 도구: Claude (claude.ai 프로젝트 "AI+X", 7주차 강의자료를 컨텍스트로 제공)

---

## [이슈 #_—_] 제목 / Title : 7주차 설계 (아키텍처 다이어그램, ERD, 이슈 목록)

**목표(스펙) / Spec**
- 입력 Input: 7주차 강의자료(계층 분리, Information Hiding, 결합도·응집도), 팀 아이디어 "긍정 도파민 활동(산책, 일기, 명상, 독서, 충분한 수면)을 하면 씨앗에 물을 주고 나무로 키우는 앱"
- 처리 Processing: 표현·로직·데이터 3계층 아키텍처 다이어그램 → 계층 표 → 서버 DB ERD → 이슈 목록과 마일스톤 순서로 요청하고, 팀 결정이 생길 때마다 다시 고쳐 달라고 함
- 출력 Output: 아키텍처 다이어그램(3계층, 모듈 10여 개, 데이터 흐름 화살표), ERD(테이블 6개), 이슈 15개(완료 조건·라벨·마일스톤) 엑셀 파일, `week-07.md`의 계층 표
- 실패 조건 Failure: 계층 사이 의존이 양방향이 되거나, 우리 앱의 활동 인증 방식과 다른 구조가 나오면 실패

**요청한 프롬프트 요지 / Prompt (summary)**
- "긍정적인 도파민 활동을 하면 씨앗에 물을 주고 나무로 키우는 앱"의 아키텍처 다이어그램을 그려 달라
- 산책은 기기 건강 데이터 대신 GPS 위치 정보로 인증하도록 바꿔 달라
- 명상은 정해진 클래식 음악이 재생되는 동안 휴대폰 조작이 없으면 인정, 독서는 독후감을 일정 분량 이상 쓰면 인정하도록 반영해 달라
- 일정 기간 활동하지 않으면 나무가 시드는 기능을 다이어그램과 이슈 목록에 넣어 달라
- 앱 DB 테이블 구조를 ERD로, 이슈 목록을 스프레드시트로 만들어 달라

**결과에 대한 판단 / Decisions**
- 채택한 부분과 이유 / Accepted, because:
  - 활동 인증 규칙을 `활동 인증` 모듈 하나에 숨기는 구조. 인증 기준(거리, 시간, 독후감 분량)은 자주 바뀔 텐데, 바뀌어도 물주기 엔진과 화면은 고치지 않아도 되기 때문 (Information Hiding)
  - `시듦 판정`을 물주기 엔진과 별도 모듈로 둔 것. 물주기는 활동이 있을 때, 시듦은 활동이 없을 때 시간이 지나 동작해서 바뀌는 이유가 다르기 때문
  - GPS 경로 좌표, 일기·독후감 본문은 기기에만 저장하고 서버에는 결과만 올리는 원칙. "수집하지 않은 데이터는 유출될 수 없다"(7주차)와 맞고, 인증에는 결과만 필요하기 때문
  - 마일스톤 2개(MVP 완료 11주차, 실행 패키지 13주차)로 나눈 것. 산책 하나로 기록 → 인증 → 물주기 → 성장이 한 번 끝까지 돌아가는 것을 먼저 만들기 위해
- 수정한 부분과 이유 / Changed, because:
  - 처음 다이어그램은 산책을 기기 건강 데이터(걸음 수)로 인증했는데, GPS 위치 기반으로 바꿈. 팀이 원하는 방식이 GPS였기 때문. 차량 이동을 막는 평균 시속 7km 초과 불인정 규칙도 함께 추가
  - 명상·독서가 처음에는 "타이머" 이슈 하나였는데, 팀이 정한 인증 방식(클래식 음악 재생 중 무조작, 독후감 분량)이 서로 달라 이슈 2개로 나눔
  - 이슈 표 양식을 수업 활동지 양식(번호, 제목, 라벨, 담당, 완료 조건)에 맞게 열 순서를 바꿈
  - 완료 조건의 수치(독후감 200자, 시듦 3일)는 AI가 예시로 넣은 값이라 팀에서 확정해야 함
- 폐기한 부분과 이유 / Rejected, because:
  - 이슈 표의 "상태" 열. 수업 활동지 양식에 없고, 상태는 GitHub 이슈에서 관리하면 되기 때문

**검증 방법 / How it was verified**
- 계층 표의 "의존하지 않는 것" 칸을 채우며 다이어그램의 화살표가 표현 → 로직 → 데이터 한 방향인지 확인
- 이슈 완료 조건마다 "테스트나 화면으로 확인할 수 있는가"를 팀원과 함께 검토하고, 담당자를 나눠 `week-07.md`에 직접 옮겨 적음

---

## [이슈 #_3_] 제목 / Title : [1] 프로젝트 초기설정

GitHub 이슈 #3 (활동지 번호 1), PR #1, #2

**목표(스펙) / Spec**
- 입력 Input: 7주차 계층 표와 이슈 목록, 팀 저장소 `kkaknew/AI-X-2team`
- 처리 Processing: AI가 저장소에 3계층 폴더 구조와 빈 앱을 만들어 브랜치에 올리고 PR을 엶 → 팀원이 로컬에서 설치·실행해 확인 → 오류가 나면 화면을 보여 주고 함께 고침
- 출력 Output: `src/presentation`, `src/logic`, `src/data` 3계층 폴더와 모듈 빈 파일, 하단 탭 3개가 있는 빈 앱, 계층 규칙 테스트, `CLAUDE.md`, `ETHICS.md`, `README.md`, `.gitignore`
- 실패 조건 Failure: 앱이 휴대폰에서 실행되지 않거나, 3계층 폴더 구조가 없으면 실패 (완료 조건: 표현·로직·데이터 3계층 폴더 구조가 있고, 빈 앱이 빌드·실행된다)

**요청한 프롬프트 요지 / Prompt (summary)**
- 프로젝트 초기설정은 어떻게 해야 하는지 알려 달라
- GitHub 저장소에 연결해서 직접 올려 달라
- 팀원이 Node.js를 쓰니 Flutter 대신 Node.js 기반으로 해 달라
- 실행 중 나온 오류 화면을 보여 주며 해결 방법을 물어봄 (npm 실행 정책, 테스트 실패, 다른 폴더에서 실행, 패키지 미설치)
- 조원들이 실행할 수 있게 정리해서 올려 달라

**결과에 대한 판단 / Decisions**
- 채택한 부분과 이유 / Accepted, because:
  - React Native(Expo) + TypeScript. 팀원이 Node.js에 익숙하고, 휴대폰의 Expo Go 앱만 있으면 Android Studio 없이 바로 실행해 볼 수 있기 때문
  - 계층 의존 방향을 검사하는 테스트(`architecture.test.ts`). AI 에이전트가 여러 파일을 한꺼번에 고치다 계층을 넘는 import를 넣어도 테스트에서 잡을 수 있기 때문 (7주차 "에이전트가 안전하게 일할 수 있는 경계")
  - `CLAUDE.md`에 아키텍처, 인증 규칙, 개인정보 원칙, 작업 규칙을 적은 것. 다음 이슈부터 AI에게 같은 설명을 반복하지 않고 컨텍스트로 줄 수 있기 때문 (2주차 Context Engineering)
  - `README.md`의 조원 실행 안내와 "자주 나오는 문제" 표. 실제로 겪은 오류를 그대로 정리해서 다른 조원이 같은 곳에서 막히지 않게 하기 위해
- 수정한 부분과 이유 / Changed, because:
  - 기술 스택을 Flutter에서 Expo로 변경. 처음 AI가 제안한 Flutter는 팀원들이 써 본 적이 없고 Flutter SDK와 Android Studio 설치가 필요했기 때문
  - Expo 버전을 SDK 54에서 58로 올림. AI가 작성한 버전으로는 휴대폰의 최신 Expo Go 앱에서 열리지 않을 수 있어서 `npx expo install expo@latest`로 맞춤
  - 계층 규칙 테스트를 jest(jest-expo)에서 Node.js 내장 테스트 러너로 바꿈. jest-expo가 `expo-modules-core`를 찾지 못해 테스트가 실행되지 않았는데, 이 테스트는 파일의 import 줄만 읽어서 무거운 도구가 필요 없었기 때문
  - `expo-splash-screen` 패키지 추가. 실행 중 미설치 오류가 나서 추가했고, AI 환경에서는 패키지 설치가 막혀 있어 `package-lock.json`은 로컬에서 갱신해 올림
- 폐기한 부분과 이유 / Rejected, because:
  - Flutter로 만든 첫 번째 커밋. 위 기술 스택 변경으로 사용하지 않음 (이력에는 남아 있음)
  - jest, jest-expo 의존성. 위 테스트 변경으로 제거
  - npm 설치 후 안내된 `npm audit fix --force`. Expo가 맞춰 둔 패키지 버전이 깨질 수 있어 실행하지 않음

**검증 방법 / How it was verified**
- 로컬(Windows, Visual Studio 터미널)에서 `npm install` 후 `npm test` 실행 → 계층 규칙 테스트 4개 통과 (`pass 4`, `fail 0`)
- `npx expo start` 후 휴대폰 Expo Go 앱으로 QR 코드를 찍어 하단 탭 3개가 있는 화면이 뜨고 탭 이동이 되는 것을 확인 → 완료 조건 충족
- PR #1, #2에서 변경 파일을 확인한 뒤 직접 merge, `git pull`로 main이 최신 상태인지 확인

---
## [이슈 #_7_] 제목 / Title : [5] 물주기

GitHub 이슈 #7 (활동지 번호 5)

**목표(스펙) / Spec**
- 입력 Input: 이슈 완료 조건, `CLAUDE.md`(3계층 규칙, "WateringEngine은 인증된 활동 1건만 받는다"), #4 DB 스키마(`growth_stages`, `trees`), #6 활동 인증 결과(`verified`)
- 처리 Processing: AI에게 물주기 로직과 테스트 초안을 요청하고, 생성된 파일을 로컬에서 테스트한 뒤 직접 커밋·PR
- 출력 Output: `src/logic/WateringEngine.ts`, `src/data/TreeRepository.ts`(인터페이스), `src/data/SqliteTreeRepository.ts`(SQLite 구현), `src/__tests__/WateringEngine.test.ts`
- 실패 조건 Failure: 인증 1건당 보상만큼 물이 쌓이지 않거나, 기준량에 도달해도 단계가 바뀌지 않으면 실패

**요청한 프롬프트 요지 / Prompt (summary)**
- 이슈 5번 물주기를 만들어 달라. GitHub에는 내가 직접 올릴 수 있게 파일로 달라

**결과에 대한 판단 / Decisions**
- 채택한 부분과 이유 / Accepted, because:
  - 물주기 엔진이 활동 종류를 모르고 `verified`와 `waterReward`만 받는 구조. `CLAUDE.md`의 계층 규칙대로 인증 규칙이 바뀌어도 물주기는 고칠 필요가 없기 때문
  - 단계 기준량을 코드가 아니라 DB(`growth_stages.water_required`)에서 읽는 것. 팀이 수치를 확정하면 DB만 바꾸면 되기 때문
  - 물을 줄 때 `last_watered_at`을 저장하는 것. 시듦 판정(#17)에서 그대로 쓸 수 있기 때문
  - SQLite 구현이 expo-sqlite를 직접 import하지 않고 필요한 메서드만 받는 구조. Node 내장 SQLite로 같은 SQL을 테스트할 수 있기 때문
- 수정한 부분과 이유 / Changed, because:
  - 기존 `WateringEngine` 뼈대는 `ActivityRepository`도 받았는데 물주기에는 필요 없어 `TreeRepository`만 받도록 바꿈
  - 마지막 단계 도달 시 완료 처리·새 씨앗은 #16 이슈 범위라, 여기서는 `isFinalStage`로 알려주기만 함
- 폐기한 부분과 이유 / Rejected, because:
  - (팀 검토 후 작성)

**검증 방법 / How it was verified**
- 로컬에서 `npm test` 실행: 물주기 테스트 14개 포함 전체 54개 통과 (`pass 54`, `fail 0`)
- 완료 조건 대응 테스트: "인증 1건당 보상만큼 물이 쌓인다", "기준량(10)에 딱 도달하면 새싹으로 바뀐다", "씨앗 → 새싹 → 묘목 → 어린 나무 → 나무 순서로 자란다"
- 팀에서 정할 것: 시든 나무에 물을 주면 회복되는지(#17과 함께 결정)

---
## [이슈 #_8_] 제목 / Title : [6] 활동 기록 화면

GitHub 이슈 #8 (활동지 번호 6)

**목표(스펙) / Spec**
- 입력 Input: 이슈 완료 조건, `CLAUDE.md`(3계층 규칙: 화면은 데이터 계층을 직접 부르지 않는다), #6 활동 인증 규칙(`ActivityVerifier`), #5 GPS 산책(`LocationRepository`), #7 물주기(`WateringEngine`)
- 처리 Processing: AI에게 활동 기록 화면과 테스트 초안을 요청하고, 휴대폰(Expo Go)에서 실행해 본 뒤 직접 커밋·PR
- 출력 Output: `src/presentation/ActivityScreen.tsx`, `src/logic/ActivityRecorder.ts`, `src/__tests__/ActivityRecorder.test.ts`, `src/data/database.ts`(`getActivityType` 추가), `src/App.tsx`(조립)
- 실패 조건 Failure: 활동 5종 중 기록할 수 없는 것이 있거나, 인증 성공·실패 결과가 화면에 표시되지 않으면 실패

**요청한 프롬프트 요지 / Prompt (summary)**
- 이슈 6번 활동 기록 화면을 만들어 달라. GitHub에는 내가 직접 올릴 것이니 코드는 올리지 말 것

**결과에 대한 판단 / Decisions**
- 채택한 부분과 이유 / Accepted, because:
  - 화면이 DB·GPS를 직접 부르지 않고 로직 계층의 `ActivityRecorder`만 쓰는 구조. architecture 테스트(표현 → 데이터 직접 import 금지)를 지키기 때문
  - 인증 기준 수치를 화면이 모르고 `ActivityVerifier`의 결과(`verified`, `reasons`)만 보여주는 것. 기준이 바뀌어도 화면은 고칠 필요가 없기 때문
  - 일기·독후감은 글자 수만 넘기고 본문은 저장하지 않는 것. `ETHICS.md` 원칙과 맞고, 본문 저장은 #10, #12 범위이기 때문
  - 인증되면 `water_reward`만큼 `WateringEngine.water()`로 물을 주는 것. 나무 화면(#9)이 바로 갱신되기 때문
- 수정한 부분과 이유 / Changed, because:
  - 명상은 정해진 클래식 음악 재생이 #11 범위라, 지금은 60초 타이머로 대신하고 조작·앱 이탈 여부만 기록함
  - 수면 시각 입력은 날짜 선택 패키지를 추가하지 않고 "시:분" 글자 입력으로 함
- 폐기한 부분과 이유 / Rejected, because:
  - (팀 검토 후 작성)

**검증 방법 / How it was verified**
- `npm test`: `ActivityRecorder` 테스트 포함 전체 76개 통과 (`pass 76`, `fail 0`)
- 완료 조건 대응 테스트: 활동 5종(산책·일기·명상·독서·수면) 각각 인증 성공·실패 결과, "평균 시속 7km 초과 산책은 실패 결과가 나온다", "인증되면 보상만큼 물을 준다"
- 휴대폰(Expo Go)에서 활동 기록 탭 실행 확인: (직접 확인 후 작성)
- 팀에서 정할 것: 기록(activity_logs) 저장은 #14 기록 조회 화면과 함께 붙일지

---
(이슈 단위로 반복 / repeat per issue)
