-- SVN 테이블 편집 보드 — Cloudflare D1 스키마
-- 적용:  wrangler d1 execute svn_table_board --file=./schema.sql   (원격은 --remote 추가)

-- 현재 편집(사용) 중인 테이블. table_name 이 PK 라 한 테이블은 한 명만 점유.
CREATE TABLE IF NOT EXISTS editing (
  table_name  TEXT PRIMARY KEY,
  user_email  TEXT NOT NULL,
  user_name   TEXT,
  started_at  TEXT NOT NULL,        -- ISO8601 (UTC)
  note        TEXT DEFAULT '',
  reminded    INTEGER DEFAULT 0     -- 1시간 경과 알림을 보냈는지(0=아직)
);

-- 보드에 표시할 테이블 목록.
CREATE TABLE IF NOT EXISTS tables (
  table_name  TEXT PRIMARY KEY,
  memo        TEXT DEFAULT '',
  sort_order  INTEGER DEFAULT 0
);

-- 기타 설정(예: svn_repo_url). key-value.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- 감사 로그(선택): 시작/종료 이력.
CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name  TEXT NOT NULL,
  user_email  TEXT NOT NULL,
  action      TEXT NOT NULL,        -- start | finish | conflict
  at          TEXT NOT NULL
);

-- 초기 테이블 목록(원하는 대로 수정하세요).
INSERT OR IGNORE INTO tables(table_name, memo, sort_order) VALUES
  ('monster_table.xlsx', '몬스터 스탯/밸런스', 1),
  ('item_table.xlsx',    '아이템 정의',       2),
  ('skill_table.xlsx',   '스킬 데이터',       3),
  ('quest_table.xlsx',   '퀘스트/보상',       4),
  ('drop_table.xlsx',    '드랍 테이블',       5);

INSERT OR IGNORE INTO settings(key, value) VALUES
  ('svn_repo_url', 'https://svn.vicgamestudios.com/svn/GameData');
