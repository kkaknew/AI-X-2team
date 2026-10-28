# 도파민 나무 (AI-X 2팀)

긍정적인 도파민 활동을 하면 씨앗에 물을 주고 나무로 키우는 앱입니다.

- 활동: 산책(GPS), 일기, 명상(클래식 음악), 독서(독후감), 수면
- 인증된 활동마다 물을 받아 나무가 자라고, 오래 활동하지 않으면 나무가 시듭니다.

## 실행 방법

[Flutter SDK](https://docs.flutter.dev/get-started/install)를 설치한 뒤:

```bash
cd src
flutter create .   # 처음 한 번만: android/ios 폴더 생성
flutter pub get
flutter run
```

테스트: `flutter test`

## 문서

- 주차별 활동지: `week-01.md` ~ `week-07.md`
- 아키텍처와 작업 규칙: `CLAUDE.md`
- 개인정보 판단 기록: `ETHICS.md`
