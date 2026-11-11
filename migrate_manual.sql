-- 보드에서 "테이블 추가" 버튼으로 넣은 항목을 동기화에서 보호하기 위한 컬럼.
-- ※ 보통은 실행할 필요가 없습니다. 보드 코드가 처음 쓰기 작업을 할 때 자동으로 추가합니다.
--    수동으로 확인하고 싶을 때만 D1 Console 에서 아래 한 줄을 실행하세요.
--    (이미 있으면 "duplicate column name: manual" 오류가 나는데, 그건 정상입니다.)

ALTER TABLE tables ADD COLUMN manual INTEGER DEFAULT 0;
