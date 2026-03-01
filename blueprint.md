# Blueprint: 딩동댕닷컴

## 1. 프로젝트 개요

'딩동댕닷컴'은 사용자들이 다양한 주제의 미래 예측 퀴즈에 참여하고, 예측 성공 시 포인트를 획득하는 즐거움을 제공하는 웹 애플리케이션입니다. 투기나 도박이 아닌, 집단지성의 힘과 지적 유희를 핵심 가치로 삼습니다.

- **핵심 기능**: 퀴즈 참여, 포인트 시스템, 사용자 인증 및 랭킹
- **기술 스택**: HTML, CSS(TailwindCSS), JavaScript, Firebase (BaaS)
- **디자인 원칙**: 모던하고 직관적인 UI/UX, 다크 모드 지원, 완벽한 반응형 디자인

---

## 2. 애플리케이션 상태 (v0.4)

- **UI/UX**:
    - 다크/라이트 모드 전환 기능 구현.
    - TailwindCSS를 사용한 반응형 레이아웃 구성.
    - 퀴즈 목록을 보여주는 아코디언 UI 및 모바일 반응형 디자인 적용.
    - 정교한 로그인/회원가입 모달 UI 및 피드백 메시지 영역 구현.
    - 인증 요청 시 로딩 상태(스피너) 표시.
    - **[v0.4]** 로그인 시, 상단 헤더에 사용자 닉네임과 보유 포인트를 표시.

- **기능**:
    - 카테고리별 퀴즈 필터링 기능.
    - 실시간 투표 및 투표 상태 복원 기능.
    - Firebase Email/Password 및 Google 소셜 로그인 기능.
    - `alert`를 제거하고 모달 내 전용 메시지 영역을 통해 일관된 피드백 제공.

- **데이터베이스 (Firestore)**:
    - **[v0.4]** `users` 컬렉션 도입: 회원가입 시 사용자 문서(`users/{userId}`)를 생성하고 `displayName`과 초기 `points` (0)를 저장.
    - **[v0.4]** `firestore.rules` 업데이트: `users` 컬렉션에 대한 보안 규칙을 추가하여 사용자가 자신의 포인트는 수정할 수 없도록 제한.

---

## 3. 새로운 계획: 데이터 모델 확장 (v0.5)

**목표**: 향후 퀴즈 관리(시작/종료/정산) 및 고도화된 사용자 프로필 기능을 지원하기 위해 Firestore 데이터 모델을 확장합니다. 이 단계는 **순수한 데이터-레이어 준비 단계**이며, UI나 실시간 로직 변경은 포함하지 않습니다.

**작업 단계:**

1.  **퀴즈 문서 스키마 확장 (`quizzes/quiz1/quizzes/{quizId}`)**
    *   퀴즈의 생명주기를 관리하기 위해 다음 필드를 추가합니다. 이 필드들은 `nullable`이며, 기존 퀴즈 문서에 존재하지 않아도 현재 애플리케이션 로직에 영향을 주지 않습니다.
        *   `status` (string): 퀴즈의 현재 상태. (예: `active`, `closed`, `settled`)
        *   `startAt` (timestamp): 퀴즈 시작 시간 (nullable)
        *   `endAt` (timestamp): 퀴즈 종료/마감 시간 (nullable)
        *   `correctOptionId` (string): 정답으로 확정된 옵션의 ID (nullable)
        *   `settledAt` (timestamp): 포인트 정산이 완료된 시간 (nullable)

2.  **사용자 프로필 컬렉션 구조 정의 (`userProfiles/{uid}`)**
    *   기존의 간단한 `users` 컬렉션을 대체할, 더 상세한 정보를 담는 `userProfiles` 컬렉션의 구조를 정의합니다. 이 단계에서는 실제 마이그레이션이나 UI 연동을 수행하지 않습니다.
    *   **문서 구조**: `userProfiles/{uid}`
        *   `points` (number): 보유 포인트 (기본값: 0)
        *   `winCount` (number): 예측 성공 횟수 (기본값: 0)
        *   `totalParticipation` (number): 총 퀴즈 참여 횟수 (기본값: 0)
        *   `role` (string): 사용자 권한 (예: `user`, `admin`, `moderator`)
        *   `isBanned` (boolean): 계정 차단 여부 (기본값: false)
        *   `createdAt` (timestamp): 프로필 생성 시간

3.  **`firestore.rules` 업데이트**
    *   새로 정의된 `userProfiles` 컬렉션에 대한 보안 규칙을 추가합니다.
    *   퀴즈 문서의 새로운 관리자용 필드(`status`, `correctOptionId` 등)는 `admin` 또는 `moderator` 역할을 가진 사용자만 수정할 수 있도록 규칙을 강화합니다.

**마이그레이션 고려사항**: 기존 `quizzes` 문서에는 새로운 상태 필드들이 존재하지 않습니다. 애플리케이션 로직은 이 필드들이 `null` 또는 `undefined`일 경우를 항상 대비하여 작성되어야 합니다. 기존 `users` 컬렉션에서 `userProfiles`로의 데이터 마이그레이션은 추후 별도의 계획으로 진행될 것입니다.
