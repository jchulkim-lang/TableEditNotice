-- SVN 테이블 편집 보드 — Cloudflare D1 스키마 (탭/그룹 지원)
-- 새 D1 을 만들 때 이 파일 내용을 Console 에 붙여넣어 실행하세요.
-- 이미 운영 중인 D1 은 migrate_tabs.sql 을 실행하세요(기존 목록/점유는 초기화됨).

-- 현재 편집(사용) 중. (그룹 + 테이블명) 조합이 PK.
CREATE TABLE IF NOT EXISTS editing (
  grp         TEXT NOT NULL DEFAULT 'plan',   -- plan=기획, dev=개발
  table_name  TEXT NOT NULL,
  user_email  TEXT NOT NULL,
  user_name   TEXT,
  started_at  TEXT NOT NULL,                  -- ISO8601 (UTC)
  note        TEXT DEFAULT '',
  reminded    INTEGER DEFAULT 0,              -- 1시간 경과 알림 발송 여부
  PRIMARY KEY (grp, table_name)
);

-- 탭(그룹)별 테이블 목록.
CREATE TABLE IF NOT EXISTS tables (
  grp         TEXT NOT NULL DEFAULT 'plan',
  table_name  TEXT NOT NULL,
  memo        TEXT DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  PRIMARY KEY (grp, table_name)
);

-- 설정(예: svn_repo_url_plan, svn_repo_url_dev).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 이력(선택).
CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  grp         TEXT,
  table_name  TEXT NOT NULL,
  user_email  TEXT NOT NULL,
  action      TEXT NOT NULL,
  at          TEXT NOT NULL
);

-- 목록은 동기화 스크립트(bat)가 채웁니다.
