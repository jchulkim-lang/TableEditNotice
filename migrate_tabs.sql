-- 기존에 운영 중이던 D1 을 "탭(그룹) 지원" 구조로 바꾸는 마이그레이션.
-- ⚠️ tables/editing 을 새 구조로 다시 만들기 때문에, 현재 목록과 "사용 중" 상태는 초기화됩니다.
--    (동기화 bat 을 다시 돌리면 목록은 즉시 복구됩니다. 사용 중 상태만 리셋됩니다.)
--    가능하면 아무도 편집 중이 아닐 때 실행하세요.
-- 사용법: D1 → 해당 데이터베이스 → Console 에 아래 전체를 붙여넣고 실행.

DROP TABLE IF EXISTS editing;
DROP TABLE IF EXISTS tables;

CREATE TABLE editing (
  grp         TEXT NOT NULL DEFAULT 'plan',
  table_name  TEXT NOT NULL,
  user_email  TEXT NOT NULL,
  user_name   TEXT,
  started_at  TEXT NOT NULL,
  note        TEXT DEFAULT '',
  reminded    INTEGER DEFAULT 0,
  PRIMARY KEY (grp, table_name)
);

CREATE TABLE tables (
  grp         TEXT NOT NULL DEFAULT 'plan',
  table_name  TEXT NOT NULL,
  memo        TEXT DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  PRIMARY KEY (grp, table_name)
);

-- (선택) 기존 svn 주소 설정을 기획 탭 값으로 옮김. 없으면 무시됨.
INSERT OR IGNORE INTO settings(key, value)
  SELECT 'svn_repo_url_plan', value FROM settings WHERE key='svn_repo_url';
