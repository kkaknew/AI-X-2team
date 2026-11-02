# 도파민 나무 (AI-X 2팀)

긍정적인 도파민 활동을 하면 씨앗에 물을 주고 나무로 키우는 앱입니다.

- 활동: 산책(GPS), 일기, 명상(클래식 음악), 독서(독후감), 수면
- 인증된 활동마다 물을 받아 나무가 자라고, 오래 활동하지 않으면 나무가 시듭니다.
- 기술 스택: React Native(Expo SDK 58) + TypeScript

## 처음 실행하기 (한 번만)

### 1. 준비물 설치

- 컴퓨터: [Node.js](https://nodejs.org/) LTS 버전, [Git](https://git-scm.com/)
- 휴대폰: **Expo Go** 앱 (Play 스토어 / App Store). 이미 있다면 최신 버전으로 업데이트하세요.
- 편집기는 자유입니다. 처음이라면 [VS Code](https://code.visualstudio.com/)를 권합니다.

### 2. 저장소 받고 패키지 설치

터미널에서 한 줄씩 입력합니다.

```
git clone https://github.com/kkaknew/AI-X-2team.git
cd AI-X-2team
cd src
npm install
```

### 3. 휴대폰에서 실행

```
npx expo start
```

터미널에 나온 QR 코드를 찍으면 앱이 열립니다.

- 안드로이드: Expo Go 앱의 "Scan QR code"
- 아이폰: 기본 카메라 앱

컴퓨터와 휴대폰이 **같은 Wi-Fi**에 있어야 합니다. 학교 Wi-Fi처럼 연결이 안 되면 `npx expo start --tunnel`로 실행하세요.
하단에 "나무 / 활동 기록 / 기록 조회" 탭이 보이면 성공입니다.

## 다음부터 실행하기

```
cd AI-X-2team
git switch main
git pull
cd src
npm install
npx expo start
```

`git pull`로 조원들이 올린 최신 코드를 받습니다. 새 패키지가 추가됐을 수 있으니 `npm install`도 함께 해 주세요.

## 자주 나오는 문제

| 증상 | 해결 |
|---|---|
| `npm.ps1을 로드할 수 없습니다` (Windows) | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 입력 후 Y, 다시 실행 |
| `npx expo start`에서 `Need to install the following packages: expo ... Ok to proceed?` | 다른 폴더에서 실행한 것입니다. y를 누르지 말고 Ctrl+C 후 `AI-X-2team\src` 폴더로 이동 |
| `... is not installed` 같은 패키지 없음 오류 | `src`에서 `npm install` 다시 실행 |
| `npm warn`, `vulnerabilities` 경고 | 무시해도 됩니다. `npm audit fix --force`는 실행하지 마세요 (Expo 버전이 깨짐) |
| Expo Go에서 "SDK 버전이 맞지 않음" | Expo Go 앱을 최신 버전으로 업데이트 |
| Visual Studio 솔루션 탐색기에 파일이 안 보임 | "새 프로젝트"가 아니라 파일 → 열기 → 폴더로 `AI-X-2team` 폴더를 엽니다 |

## 작업하고 올리기

1. 최신 코드 받기: `git switch main` → `git pull`
2. 이슈 브랜치 만들기: `git switch -c feature/이슈번호-요약` (예: `feature/3-gps-walk`)
3. 작업 후 올리기
   ```
   git add 바꾼파일
   git commit -m "#이슈번호 요약"
   git push -u origin 브랜치이름
   ```
4. GitHub에서 Pull Request를 열고, 본문에 `Closes #이슈번호`를 적은 뒤 merge합니다.

push하려면 저장소 주인이 Settings → Collaborators에서 내 GitHub 계정을 초대해야 합니다.
`.vs/`, `.vscode/` 같은 편집기 설정 폴더는 `.gitignore`로 제외되어 있습니다.

## 테스트

`src`에서 실행합니다.

- `npm test`: 계층 의존 규칙 테스트
- `npm run typecheck`: TypeScript 타입 검사

## 문서

- 주차별 활동지: `week-01.md` ~ `week-07.md`
- 아키텍처와 작업 규칙: `CLAUDE.md`
- 개인정보 판단 기록: `ETHICS.md`
