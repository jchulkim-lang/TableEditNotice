-- SVN 테이블 편집 보드 — Cloudflare D1 스키마 (Trunk/Branch 라인 + 탭/그룹 + 부서 즐겨찾기)
-- 새 D1 을 만들 때 이 파일 내용을 실행하세요. (D1 콘솔은 한 문장씩 실행이 안전)
-- 기존 운영 DB 는 migrate_lines.sql 을 실행하세요.

CREATE TABLE IF NOT EXISTS editing (
  line        TEXT NOT NULL DEFAULT 'trunk',   -- trunk/branch
  grp         TEXT NOT NULL DEFAULT 'plan',     -- plan=기획, dev=개발
  table_name  TEXT NOT NULL,
  user_email  TEXT NOT NULL,
  user_name   TEXT,
  started_at  TEXT NOT NULL,
  note        TEXT DEFAULT '',
  reminded    INTEGER DEFAULT 0,
  PRIMARY KEY (line, grp, table_name)
);

CREATE TABLE IF NOT EXISTS tables (
  line        TEXT NOT NULL DEFAULT 'trunk',
  grp         TEXT NOT NULL DEFAULT 'plan',
  table_name  TEXT NOT NULL,
  memo        TEXT DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  manual      INTEGER DEFAULT 0,   -- 1 = 보드에서 직접 추가(동기화해도 지워지지 않음)
  PRIMARY KEY (line, grp, table_name)
);

CREATE TABLE IF NOT EXISTS favorites (
  line        TEXT NOT NULL DEFAULT 'trunk',
  dept        TEXT NOT NULL,
  src_grp     TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  PRIMARY KEY (line, dept, src_grp, table_name)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,   -- 예: svn_repo_url_trunk_plan, svn_repo_url_branch_dev
  value TEXT
);

CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  line        TEXT,
  grp         TEXT,
  table_name  TEXT NOT NULL,
  user_email  TEXT NOT NULL,
  action      TEXT NOT NULL,
  at          TEXT NOT NULL
);
