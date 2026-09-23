# 4주차 활동지 / Week 4 Worksheet

**주제 선택과 요구 명세 / Choosing a problem & writing the spec**

- 작성일 / Date: 
- 참여자 / Present: 

---

## ① 주제 선택 / Choosing one problem

| 항목 Item | 내용 |
|---|---|
| 선택한 주제 Chosen | 숏폼중독해결을 위한 억제 서비스 |
| 선택 근거 Why | 야간 숏폼 이용자들의 수면부족 문제를 해결하기 위해 |

## ② 성공 기준 가져오기 / Success criteria from Week 3

| 3주차 성공 기준 원문 Original (Week 3) | 모호한 표현 Vague words |
|---|---|
| *(예시) 학생들이 과제 제출 현황을 쉽게 확인할 수 있다* | *쉽게, 확인할 수 있다* |
| 야간 숏폼이용시간 감소 |  |

## ③ Acceptance Criteria

최소 정상 경로 2개 + 실패 경로 1개. **판정 방법** 칸이 비면 아직 명세가 아닙니다.
At least two normal paths + one failure path. If "How to check" is empty, it is not yet a spec.

| # | 경로 Path | EARS 문장 Sentence | 판정 방법 How to check |
|---|---|---|---|
| *예시* | *정상* | *WHEN 학생이 과제 목록을 열면 THE 시스템은 SHALL 과목별 미제출 과제를 마감일 순으로 표시한다* | *미제출 과제 3건을 만든 뒤 목록을 열어 마감일 순으로 나오는지 확인* |
| AC-1 | 정상 Normal | WHEN 시간을 선택하면 THE 시스템은 SHALL 채도 낮춤 서비스를 선택한 시간부터 동작하게됨 | 현재시점 1분뒤로 시간을 설정 후 채도를 낮추는지 확인 |
| AC-2 | 정상 Normal | WHILE 작동시간을 선택 THE 시스템은 SHALL 작동시간동안 채도를 낮춰서 최종적으로 흑백화면이 되도록한다 | 작동시간을 5분으로 둔 후 5분안에 채도가 빠지는지 확인 |
| AC-3 | 실패 Failure | IF 취침 시작 시간 설정값이 현재 시간보다 이전이면  THEN THE 시스템은 SHALL 설정을 저장하고 설정시간이 현재시각보다 이르다는 알림을 띄우고 다음날 부터 작동 | 현재시간보다 10분 이전 시간으로 설정한 후 알림이 오는지 확인 |

> 확인할 동작이 더 있으면 AC-4부터 행을 추가해 쓰십시오.
> If there are more behaviors to check, add rows from AC-4.

- [ ] 이번 활동에서 AI를 사용했다면 `PROMPTS.md`에 기록했습니다 / Logged any AI use in `PROMPTS.md`

---

> 수업 종료 시 커밋하세요 / Commit this at the end of class
> `git add docs/week-04.md && git commit -m "docs: 4주차 활동지 작성"`
