# ZSCode Planning System

Claude Code용 프로젝트 관리 플러그인입니다. MCP 서버 기반으로 Planning, Staging, Task 관리 기능을 제공합니다.

## Features

- **Staging System**: 작업을 단계(Stage)로 나누어 병렬/순차 실행 관리
- **Artifacts**: 각 Staging의 결과물을 저장하고 다음 단계에서 참조 가능
- **MCP Tools**: 컨텍스트 소모 최소화를 위한 MCP 기반 명령어
- **Human-Readable Output**: 기본적으로 읽기 쉬운 마크다운 형식 출력 (JSON은 `json: true` 옵션)
- **Smart Session Management**: Staging 완료 시 다음 Staging의 Context 소모량 및 진행 추천
- **Model Selection**: Task별 적절한 모델(opus/sonnet/haiku) 지정 지원
- **Windows 호환**: Windows 환경에서도 문제 없이 동작

## Installation

### CLI 설치

```bash
npm install -g @zeliper/zscode
# 또는
npx @zeliper/zscode init
```

### 프로젝트 초기화

```bash
cd your-project
npx @zeliper/zscode init
```

이 명령어는 다음을 생성합니다:
- `.claude/state.json` - 프로젝트 상태
- `.claude/plans/` - Plan artifacts 저장소
- `.claude/archive/` - 아카이브된 Plan
- `.claude/commands/zscode-planning.md` - 슬래시 커맨드
- `CLAUDE.md` - 프로젝트 컨텍스트

### MCP 서버 등록

```bash
claude mcp add zscode -- npx -y @zeliper/zscode-mcp-server
```

## Usage

### 1. Planning 시작

```
/zscode:planning 사용자 인증 시스템 구현
```

### 2. Plan 구조

Plan은 다음과 같은 구조로 구성됩니다:

```
Plan
├── Staging 1: 환경 설정 (parallel)
│   ├── Task 1: 패키지 설치
│   └── Task 2: 설정 파일 생성
├── Staging 2: 핵심 구현 (sequential)
│   ├── Task 3: DB 스키마 정의
│   ├── Task 4: API 구현 (depends_on: Task 3)
│   └── Task 5: 비즈니스 로직 (depends_on: Task 4)
└── Staging 3: 테스트 (parallel)
    ├── Task 6: 단위 테스트
    └── Task 7: 통합 테스트
```

### 3. Staging 시작

```
zscode:start plan-abc12345 staging-0001
```

### 4. 상태 확인

```
# 전체 Plan 상태
zscode:status

# 특정 Plan 상태
zscode:status plan-abc12345
```

### 5. 완료 및 아카이브

```
zscode:archive plan-abc12345
```

### 6. Plan 취소

```
zscode:cancel plan-abc12345 --reason "요구사항 변경"
```

## MCP Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `get_full_context` | 프로젝트 전체 상태 조회 (`lightweight: true` 권장) |
| `init_project` | 새 프로젝트 초기화 |
| `create_plan` | Plan + Staging + Task 생성 |
| `zscode:start` | Staging 시작 |
| `zscode:status` | 상태 조회 (기본: Human-readable) |
| `zscode:archive` | Plan 아카이브 |
| `zscode:cancel` | Plan 취소 |
| `update_task` | Task 상태 변경 |
| `save_task_output` | Task 결과물 저장 |
| `get_staging_artifacts` | 이전 Staging 결과물 조회 |
| `complete_staging` | Staging 수동 완료 (다음 Staging 추천 포함) |
| `add_decision` | 설계 결정사항 기록 |

### Memory Tools

| Tool | Description |
|------|-------------|
| `add_memory` | 규칙/메모리 추가 |
| `list_memories` | 메모리 목록 조회 |
| `update_memory` | 메모리 수정 |
| `remove_memory` | 메모리 삭제 |
| `get_memories_for_context` | 컨텍스트별 메모리 조회 |
| `generate_summary` | 프로젝트 요약 생성 |

### Plan/Staging/Task Modification

| Tool | Description |
|------|-------------|
| `update_plan` | Plan 제목/설명 수정 |
| `add_staging` | Staging 추가 |
| `update_staging` | Staging 수정 |
| `remove_staging` | Staging 삭제 |
| `add_task` | Task 추가 |
| `update_task_details` | Task 상세 수정 |
| `remove_task` | Task 삭제 |

## Model Selection

Task 생성 시 작업 유형에 따라 적절한 모델을 지정합니다:

| Model | 사용 용도 |
|-------|----------|
| `opus` | 코드 작성/수정, 코드 분석, 아키텍처 설계 |
| `sonnet` | 문서 작성, 설정 파일 변경, 테스트 실행 |
| `haiku` | 상태 확인, 간단한 쿼리, 파일 목록 조회 |

```json
{
  "tasks": [
    { "title": "API 엔드포인트 구현", "model": "opus" },
    { "title": "README 업데이트", "model": "sonnet" },
    { "title": "빌드 상태 확인", "model": "haiku" }
  ]
}
```

## Output Formats

모든 MCP 도구는 기본적으로 Human-readable 마크다운 형식으로 출력합니다.
JSON 형식이 필요한 경우 `json: true` 옵션을 사용합니다.

```
# Human-readable (기본)
zscode:status plan-abc12345

# JSON 형식
zscode:status plan-abc12345 json:true
```

### Staging 완료 시 출력 예시

```markdown
✅ Staging completed: **Phase 1: Setup**

## Next Staging
📋 **Phase 2: Implementation** (staging-0002)
   Tasks: 5 | Execution: parallel
   Est. Context: ~10K tokens

### Recommendation
▶️ **Continue**
   This staging has minimal context requirements. Safe to continue in current session.

▶️ To proceed: `zscode:start plan-abc12345 staging-0002`
```

## State Schema (v2.0.0)

```json
{
  "version": "2.0.0",
  "project": { "name", "description", "goals", "constraints" },
  "plans": {
    "plan-xxx": {
      "id", "title", "description",
      "stagings": ["staging-001", "staging-002"],
      "status": "draft|active|completed|archived|cancelled"
    }
  },
  "stagings": {
    "staging-xxx": {
      "id", "planId", "name", "order",
      "execution_type": "parallel|sequential",
      "tasks": ["task-xxx"],
      "artifacts_path": ".claude/plans/xxx/artifacts/staging-xxx/"
    }
  },
  "tasks": {
    "task-xxx": {
      "id", "planId", "stagingId", "title",
      "execution_mode": "parallel|sequential",
      "depends_on": ["task-yyy"],
      "status": "pending|in_progress|done|blocked|cancelled"
    }
  }
}
```

## Artifacts Structure

```
.claude/plans/{planId}/
├── plan.json
└── artifacts/
    └── staging-{id}/
        ├── task-{id}-output.json
        └── [generated files]
```

## Windows Notes

- 경로는 자동으로 OS에 맞게 처리됩니다
- JSON 저장 시 POSIX 스타일(/)로 저장되어 크로스 플랫폼 호환성 유지
- MCP 서버 설정 시 절대 경로 사용 권장

## CLI Options

### `zscode init`

```bash
zscode init [options]

Options:
  -f, --force              기존 설정 덮어쓰기
  --no-claude-md           CLAUDE.md 생성 안함
  -p, --project-name <n>   프로젝트 이름 지정 (프롬프트 스킵)
```

## Development

### 빌드

```bash
npm install
npm run build
```

### 패키지 구조

```
packages/
├── cli/          # CLI 도구 (@anthropic/zscode-cli)
└── mcp-server/   # MCP 서버 (@anthropic/zscode-mcp-server)
```

## License

MIT

## Contributing

이슈와 PR은 GitHub에서 환영합니다.
