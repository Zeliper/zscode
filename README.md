# ZSCode Planning System

Claude Code용 프로젝트 관리 플러그인입니다. MCP 서버 기반으로 Planning, Staging, Task 관리 기능을 제공합니다.

## Features

- **Staging System**: 작업을 단계(Stage)로 나누어 병렬/순차 실행 관리
- **Artifacts**: 각 Staging의 결과물을 저장하고 다음 단계에서 참조 가능
- **MCP Tools**: 컨텍스트 소모 최소화를 위한 MCP 기반 명령어
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

| Tool | Description |
|------|-------------|
| `get_full_context` | 프로젝트 전체 상태 조회 |
| `init_project` | 새 프로젝트 초기화 |
| `create_plan` | Plan + Staging + Task 생성 |
| `zscode:start` | Staging 시작 |
| `zscode:status` | 상태 조회 |
| `zscode:archive` | Plan 아카이브 |
| `zscode:cancel` | Plan 취소 |
| `update_task` | Task 상태 변경 |
| `save_task_output` | Task 결과물 저장 |
| `get_staging_artifacts` | 이전 Staging 결과물 조회 |
| `add_decision` | 설계 결정사항 기록 |

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
