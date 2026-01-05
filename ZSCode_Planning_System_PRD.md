# ZSCode Planning System
## Product Requirements Document

> Claude Code + MCP 기반 프로젝트 관리 플러그인

| 항목 | 내용 |
|------|------|
| 버전 | 1.0.0 |
| 작성일 | 2025-01-05 |
| 작성자 | Zeliper |
| 상태 | Draft |

---

## 1. Executive Summary

ZSCode Planning System은 Claude Code 환경에서 프로젝트 계획, 태스크 관리, 워크플로 자동화를 제공하는 통합 플러그인입니다. MCP(Model Context Protocol) 서버와 Hook 시스템을 활용하여 개발 세션 간 컨텍스트를 유지하고, 자동으로 작업 상태를 추적합니다.

### 1.1 핵심 가치

- **세션 간 컨텍스트 완벽 유지** - 작업 중단 후에도 이전 상태 복원
- **자동화된 태스크 추적** - Hook을 통한 실시간 상태 동기화
- **통합 계획 관리** - `/zscode:planning` 명령어로 즉시 Planning 모드 진입
- **팀 협업 지원** - state.json을 통한 프로젝트 상태 공유

---

## 2. Problem Statement

### 2.1 현재 문제점

| 문제 | 영향 | 빈도 |
|------|------|------|
| 세션 종료시 컨텍스트 손실 | 반복적인 설명 필요, 생산성 저하 | 매 세션 |
| 수동 태스크 관리 | 진행 상황 추적 어려움 | 지속적 |
| 계획과 실행의 분리 | 계획 변경시 동기화 실패 | 빈번 |
| 작업 히스토리 부재 | 의사결정 근거 추적 불가 | 프로젝트 전반 |

---

## 3. Solution Overview

### 3.1 시스템 아키텍처

시스템은 세 가지 핵심 컴포넌트로 구성됩니다:

1. **MCP Server (project-manager)**: 프로젝트 상태 관리, Plan/Task CRUD, 컨텍스트 조회
2. **Hook System**: PreToolUse, PostToolUse, Stop 훅을 통한 자동 상태 동기화
3. **Custom Command**: `/zscode:planning` 슬래시 커맨드로 Planning 모드 즉시 진입

### 3.2 데이터 흐름

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   PreHook   │───▶│ MCP Server  │◀───│  PostHook   │
└─────────────┘    └──────┬──────┘    └─────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │ state.json  │
                  └─────────────┘
```

---

## 4. Functional Requirements

### 4.1 MCP Server Tools

| Tool Name | Description | Priority |
|-----------|-------------|----------|
| `get_full_context` | 프로젝트/Plan/Task 전체 상태 반환 | P0 - Critical |
| `init_project` | 새 프로젝트 초기화 | P0 - Critical |
| `create_plan` | Plan 생성 (태스크 포함) | P0 - Critical |
| `sync_plan` | Plan/Task 상태 동기화 | P0 - Critical |
| `update_task` | 개별 태스크 상태 변경 | P1 - High |
| `complete_task` | 태스크 완료 처리 | P1 - High |
| `add_decision` | 설계 결정사항 기록 | P2 - Medium |
| `get_next_tasks` | 다음 처리할 태스크 목록 반환 | P2 - Medium |

### 4.2 Hook 동작 명세

#### PreToolUse Hook
- 현재 in_progress 상태의 태스크 확인
- 파일 수정 도구 감지시 activeFiles에 추가
- 태스크 없이 코드 수정 시도시 경고 출력

#### PostToolUse Hook
- 도구 실행 결과를 history에 자동 기록
- 테스트 성공 패턴 감지시 관련 태스크 자동 완료
- 에러 발생시 현재 태스크에 blocker 플래그 설정

#### Stop Hook
- 세션 요약 생성 및 저장
- 다음 세션 복원용 컨텍스트 준비

### 4.3 /zscode:planning 커맨드

사용자가 `/zscode:planning` 또는 `/zscode:planning [작업내용]` 입력시 자동으로 Planning 모드에 진입합니다.

#### 커맨드 워크플로

1. `get_full_context` 도구 호출로 현재 상태 로드
2. 인자 유무에 따라 Plan 생성/수정 또는 현재 상태 분석
3. 체크박스 형태의 태스크 리스트 출력
4. 사용자 확인 후 `sync_plan`으로 MCP에 저장

---

## 5. Technical Specifications

### 5.1 디렉토리 구조

```
.claude/
├── settings.json          # hooks 설정
├── commands/
│   └── zscode:planning.md # 커스텀 슬래시 커맨드
├── mcp-server/
│   ├── package.json
│   └── index.js           # MCP 서버 메인
├── hooks/
│   ├── pre-tool.js        # PreToolUse 훅
│   ├── post-tool.js       # PostToolUse 훅
│   └── on-stop.js         # Stop 훅
├── state.json             # 프로젝트 상태
└── mcp.json               # MCP 서버 설정
CLAUDE.md                  # 루트 컨텍스트
```

### 5.2 state.json 스키마

```json
{
  "project": {
    "name": "string",
    "description": "string",
    "goals": ["string"],
    "constraints": ["string"]
  },
  "currentPlan": "string | null",
  "plans": [{
    "id": "string",
    "title": "string",
    "description": "string",
    "tasks": ["taskId"],
    "createdAt": "ISO8601",
    "status": "active | completed | archived"
  }],
  "tasks": [{
    "id": "string",
    "planId": "string",
    "title": "string",
    "priority": "high | medium | low",
    "status": "pending | in_progress | done | blocked",
    "notes": "string",
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }],
  "history": [{
    "timestamp": "ISO8601",
    "type": "string",
    "details": "object"
  }],
  "context": {
    "lastUpdated": "ISO8601",
    "activeFiles": ["string"],
    "decisions": [{
      "title": "string",
      "decision": "string",
      "rationale": "string",
      "timestamp": "ISO8601"
    }]
  }
}
```

### 5.3 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| @modelcontextprotocol/sdk | ^1.0.0 | MCP 서버 구현 |
| Node.js | >=18.0.0 | 런타임 |

---

## 6. Deployment & Distribution

### 6.1 GitHub Repository 설정

gh CLI를 사용하여 자동으로 repository를 생성하고 코드를 푸시합니다.

```bash
# Repository 생성 및 푸시
gh repo create zscode-planning-system --public --description "Claude Code Planning Plugin"
git init
git add .
git commit -m "Initial commit: ZSCode Planning System v1.0.0"
git branch -M main
git remote add origin https://github.com/<username>/zscode-planning-system.git
git push -u origin main
```

### 6.2 Claude Marketplace 등록

1. GitHub repository에 적절한 태그 및 README 작성
2. package.json에 marketplace 메타데이터 추가
3. `claude marketplace publish` 명령어로 등록

### 6.3 설치 방법

```bash
# Marketplace에서 설치 (등록 후)
claude mcp add zscode-planning-system

# 또는 GitHub에서 직접 설치
claude mcp add https://github.com/<username>/zscode-planning-system
```

---

## 7. Testing & Validation

### 7.1 테스트 환경

`../zscode_test` 폴더에 테스트 프로젝트를 생성하여 검증합니다.

### 7.2 테스트 시나리오

| ID | 시나리오 | 예상 결과 |
|----|----------|----------|
| TC-01 | `/zscode:planning` 명령어 실행 | Planning 모드 진입, 현재 상태 출력 |
| TC-02 | `/zscode:planning 새 기능 구현` 실행 | Plan 생성 제안, 태스크 리스트 출력 |
| TC-03 | 파일 수정 후 PostHook 동작 | history에 자동 기록 |
| TC-04 | 테스트 성공 후 자동 완료 | 관련 태스크 status → done |
| TC-05 | 세션 종료 후 재시작 | 이전 컨텍스트 완벽 복원 |

---

## 8. Implementation Timeline

| Phase | Task | Duration |
|-------|------|----------|
| Phase 1 | MCP Server 구현 (Core Tools) | 2-3 hours |
| Phase 2 | Hook System 구현 | 1-2 hours |
| Phase 3 | Custom Command 작성 | 1 hour |
| Phase 4 | 통합 테스트 | 1-2 hours |
| Phase 5 | 문서화 & Marketplace 등록 | 1 hour |

**총 예상 소요 시간: 6-9 hours**

---

## 9. Appendix

### 9.1 참고 자료

- Claude Code Documentation: https://docs.anthropic.com/claude-code
- MCP Specification: https://modelcontextprotocol.io
- Claude Marketplace: https://marketplace.claude.ai

### 9.2 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0.0 | 2025-01-05 | Initial PRD 작성 |

---

*— End of Document —*
