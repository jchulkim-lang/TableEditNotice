-- 부서 탭(콘텐츠/시스템/전투/밸런스) 기능 추가용. 기존 DB에 표 하나만 더 만듭니다.
-- 비파괴적입니다(기존 데이터 유지). 두 D1 각각의 Console 에서 한 번 실행하세요.
CREATE TABLE IF NOT EXISTS favorites (
  dept        TEXT NOT NULL,
  src_grp     TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  PRIMARY KEY (dept, src_grp, table_name)
);
