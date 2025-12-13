-- =====================================================================
-- SEED: USER MẪU CHO CÂY GIA PHẢ (OWNER_ID = 1)
-- =====================================================================

INSERT INTO users (email, password, viewer_code, full_name, role)
VALUES ('demo@example.com', '123456', 'VIEWERCODEDEMO', 'Chủ cây demo', 'owner');

-- =====================================================================
-- PEOPLE: 44 NGƯỜI, THUỘC VỀ OWNER_ID = 1 (avatar = NULL)
-- =====================================================================

-- Đời 1: Thủy tổ (ID 1-2)
INSERT INTO people (owner_id, full_name, gender, birth_date, death_date, is_alive, avatar, biography, generation, notes) VALUES
(1, 'Nguyễn Văn A', 'Nam', '1880-01-15', '1945-08-20', 0, NULL, 'Thủy tổ dòng họ Nguyễn An Thượng, lập nghiệp từ nghề nông và buôn bán.', 1, 'Có công với làng, được thờ tự'),
(1, 'Trần Thị B', 'Nữ', '1885-03-10', '1952-06-12', 0, NULL, 'Vợ cụ A, sinh 8 con, giỏi nội trợ và dệt vải.', 1, 'Mộ ở nghĩa trang làng');

-- Đời 2: Con của thủy tổ (ID 3-6)
INSERT INTO people (owner_id, full_name, gender, birth_date, death_date, is_alive, avatar, biography, generation, notes) VALUES
(1, 'Nguyễn Văn C', 'Nam', '1905-04-20', '1975-12-30', 0, NULL, 'Con trưởng cụ A, làm quan lại thời Pháp.', 2, 'Chi trưởng, có 2 vợ'),
(1, 'Lê Thị D', 'Nữ', '1910-07-05', '1980-02-14', 0, NULL, 'Vợ ông C, sinh 5 con.', 2, ''),
(1, 'Nguyễn Thị E', 'Nữ', '1908-11-18', '1990-09-22', 0, NULL, 'Con gái cụ A, lấy chồng họ Phạm.', 2, 'Con nuôi 1 đứa'),
(1, 'Nguyễn Văn F', 'Nam', '1912-12-03', '1968-05-10', 0, NULL, 'Con út cụ A, hy sinh trong chiến tranh.', 2, 'Anh hùng liệt sĩ');

-- Đời 3: Cháu (ID 7-16)
INSERT INTO people (owner_id, full_name, gender, birth_date, death_date, is_alive, avatar, biography, generation, notes) VALUES
(1, 'Nguyễn Văn G', 'Nam', '1930-01-25', NULL, 1, NULL, 'Con ông C, kỹ sư xây dựng.', 3, 'Vợ mất sớm, lấy vợ lẽ'),
(1, 'Phạm Thị H', 'Nữ', '1935-06-08', '2000-11-15', 0, NULL, 'Vợ cha G, giáo viên.', 3, ''),
(1, 'Trần Văn I', 'Nam', '1932-09-12', '2010-03-05', 0, NULL, 'Con ông C (vợ lẽ), bác sĩ.', 3, 'Có con nuôi'),
(1, 'Lê Thị J', 'Nữ', '1938-02-28', NULL, 1, NULL, 'Con cô E, nhà văn.', 3, ''),
(1, 'Nguyễn Văn K', 'Nam', '1940-05-17', NULL, 1, NULL, 'Kinh doanh.', 3, ''),
(1, 'Vũ Thị L', 'Nữ', '1942-08-09', NULL, 1, NULL, 'Bác sĩ.', 3, ''),
(1, 'Nguyễn Văn M', 'Nam', '1928-10-22', '1995-07-30', 0, NULL, 'Nông dân.', 3, ''),
(1, 'Hoàng Thị N', 'Nữ', '1933-12-14', NULL, 1, NULL, 'Nội trợ.', 3, ''),
(1, 'Nguyễn Văn O', 'Nam', '1945-03-06', NULL, 1, NULL, 'Giáo sư.', 3, ''),
(1, 'Đặng Thị P', 'Nữ', '1941-07-19', '1985-01-11', 0, NULL, 'Mất trẻ.', 3, 'Mất sớm');

-- Đời 4: Chắt (ID 17-30)
INSERT INTO people (owner_id, full_name, gender, birth_date, death_date, is_alive, avatar, biography, generation, notes) VALUES
(1, 'Nguyễn Văn Q', 'Nam', '1955-04-10', NULL, 1, NULL, 'Con cha G, doanh nhân.', 4, ''),
(1, 'Nguyễn Thị R', 'Nữ', '1958-09-25', NULL, 1, NULL, 'Con anh I, luật sư.', 4, ''),
(1, 'Lê Văn S', 'Nam', '1960-11-03', NULL, 1, NULL, '', 4, ''),
(1, 'Trần Thị T', 'Nữ', '1962-02-16', NULL, 1, NULL, '', 4, ''),
(1, 'Nguyễn Văn U', 'Nam', '1965-05-29', NULL, 1, NULL, '', 4, ''),
(1, 'Phạm Thị V', 'Nữ', '1967-08-12', NULL, 1, NULL, '', 4, ''),
(1, 'Hoàng Văn W', 'Nam', '1970-10-05', NULL, 1, NULL, '', 4, ''),
(1, 'Vũ Thị X', 'Nữ', '1972-01-18', NULL, 1, NULL, '', 4, ''),
(1, 'Nguyễn Văn Y', 'Nam', '1975-03-21', NULL, 1, NULL, '', 4, ''),
(1, 'Đặng Thị Z', 'Nữ', '1977-06-04', NULL, 1, NULL, '', 4, ''),
(1, 'Lê Văn AA', 'Nam', '1980-09-07', NULL, 1, NULL, '', 4, ''),
(1, 'Trần Thị BB', 'Nữ', '1982-12-20', NULL, 1, NULL, '', 4, ''),
(1, 'Nguyễn Văn CC', 'Nam', '1985-02-13', NULL, 1, NULL, '', 4, ''),
(1, 'Phạm Thị DD', 'Nữ', '1987-05-26', NULL, 1, NULL, '', 4, '');

-- Đời 5: Chít (ID 31-44)
INSERT INTO people (owner_id, full_name, gender, birth_date, death_date, is_alive, avatar, biography, generation, notes) VALUES
(1, 'Nguyễn Văn EE', 'Nam', '2000-07-14', NULL, 1, NULL, 'Con Q, IT engineer.', 5, ''),
(1, 'Nguyễn Thị FF', 'Nữ', '2002-10-27', NULL, 1, NULL, 'Con R, marketer.', 5, ''),
(1, 'Lê Văn GG', 'Nam', '2005-01-09', NULL, 1, NULL, '', 5, ''),
(1, 'Trần Thị HH', 'Nữ', '2007-04-22', NULL, 1, NULL, '', 5, ''),
(1, 'Nguyễn Văn II', 'Nam', '2010-06-15', NULL, 1, NULL, '', 5, ''),
(1, 'Phạm Thị JJ', 'Nữ', '2012-09-28', NULL, 1, NULL, '', 5, ''),
(1, 'Hoàng Văn KK', 'Nam', '2015-11-11', NULL, 1, NULL, '', 5, ''),
(1, 'Vũ Thị LL', 'Nữ', '2018-02-24', NULL, 1, NULL, '', 5, ''),
(1, 'Nguyễn Văn MM', 'Nam', '2020-05-07', NULL, 1, NULL, '', 5, ''),
(1, 'Đặng Thị NN', 'Nữ', '2022-08-20', NULL, 1, NULL, '', 5, ''),
(1, 'Lê Văn OO', 'Nam', '1998-12-03', NULL, 1, NULL, '', 5, ''),
(1, 'Trần Thị PP', 'Nữ', '2004-03-16', NULL, 1, NULL, '', 5, ''),
(1, 'Nguyễn Văn QQ', 'Nam', '2009-07-29', NULL, 1, NULL, '', 5, ''),
(1, 'Phạm Thị RR', 'Nữ', '2014-10-12', NULL, 1, NULL, '', 5, '');

-- =====================================================================
-- RELATIONSHIPS
-- =====================================================================

INSERT INTO relationships (parent_id, child_id, relation_type) VALUES
(1, 3, 'ruot'), (2, 3, 'ruot'),
(1, 5, 'ruot'), (2, 5, 'ruot'),
(1, 6, 'ruot'), (2, 6, 'ruot'),

(3, 7, 'ruot'), (4, 7, 'ruot'),
(3, 9, 'ruot'),
(5, 10, 'ruot'),
(3, 11, 'ruot'), (4, 11, 'ruot'),
(5, 12, 'ruot'),
(3, 13, 'ruot'), (4, 13, 'ruot'),
(5, 14, 'ruot'),
(6, 15, 'ruot'),
(6, 16, 'ruot'),

(7, 17, 'ruot'), (8, 17, 'ruot'),
(9, 18, 'ruot'),
(10, 19, 'ruot'),
(7, 20, 'ruot'), (8, 20, 'ruot'),
(9, 21, 'nuoi'),
(10, 22, 'ruot'),
(11, 23, 'ruot'),
(12, 24, 'ruot'),
(13, 25, 'ruot'),
(14, 26, 'ruot'),
(15, 27, 'ruot'),
(11, 28, 'ruot'),
(7, 29, 'ruot'),
(9, 30, 'ruot'),

(17, 31, 'ruot'),
(18, 32, 'ruot'),
(19, 33, 'ruot'),
(20, 34, 'ruot'),
(21, 35, 'ruot'),
(22, 36, 'ruot'),
(23, 37, 'ruot'),
(24, 38, 'ruot'),
(25, 39, 'ruot'),
(26, 40, 'ruot'),
(27, 41, 'ruot'),
(28, 42, 'ruot'),
(29, 43, 'ruot'),
(30, 44, 'ruot');

-- =====================================================================
-- MARRIAGES
-- =====================================================================

INSERT INTO marriages (husband_id, wife_id, marriage_date, divorce_date, notes) VALUES
(1, 2, '1904-02-14', NULL, 'Hôn nhân thủy tổ'),
(3, 4, '1929-05-20', NULL, 'Ông C và bà D'),
(3, 14, '1945-10-10', NULL, 'Vợ lẽ của ông C (bà N)'),
(7, 8, '1954-08-15', '1990-01-01', 'Cha G và mẹ H (ly hôn)'),
(9, 22, '1957-03-10', NULL, 'Anh I và V'),
(15, 10, '1960-06-22', NULL, 'O và J'),
(11, 12, '1965-09-05', NULL, 'K và L'),
(13, 16, '1955-12-12', '1980-04-20', 'M và P (ly hôn, P mất trẻ)'),
(17, 26, '1980-07-18', NULL, 'Q và Z');
