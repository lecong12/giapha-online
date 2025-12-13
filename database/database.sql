-- =====================================================================
-- DATABASE GIA PHẢ HOÀN CHỈNH - VERSION STABLE
-- =====================================================================

PRAGMA foreign_keys = ON;

-- =====================================================================
-- BẢNG USERS (OWNER & VIEWER)
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email           TEXT UNIQUE NOT NULL, -- owner login
    password        TEXT NOT NULL,
    viewer_code     TEXT UNIQUE NOT NULL, -- viewer login
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK(role IN ('owner', 'viewer')),
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Trigger auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;



-- =====================================================================
-- BẢNG PEOPLE (DỮ LIỆU GIA PHẢ)
-- =====================================================================

CREATE TABLE IF NOT EXISTS people (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id            INTEGER NOT NULL,               -- mỗi cây gia phả thuộc về 1 owner
    full_name           TEXT NOT NULL,
    gender              TEXT CHECK(gender IN ('Nam', 'Nữ')),
    birth_date          TEXT,
    death_date          TEXT,
    is_alive            INTEGER DEFAULT 1,
    avatar              TEXT,
    biography           TEXT,
    generation          INTEGER,
    notes               TEXT,
    created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Trigger auto-update updated_at
CREATE TRIGGER IF NOT EXISTS trg_people_updated_at
AFTER UPDATE ON people
FOR EACH ROW
BEGIN
    UPDATE people SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;



-- =====================================================================
-- BẢNG QUAN HỆ CHA MẸ - CON
-- =====================================================================

CREATE TABLE IF NOT EXISTS relationships (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id       INTEGER NOT NULL,
    child_id        INTEGER NOT NULL,
    relation_type   TEXT DEFAULT 'ruot' CHECK(relation_type IN ('ruot', 'nuoi', 'ke')),

    FOREIGN KEY (parent_id) REFERENCES people(id) ON DELETE CASCADE,
    FOREIGN KEY (child_id) REFERENCES people(id) ON DELETE CASCADE,

    UNIQUE(parent_id, child_id, relation_type),
    CHECK(parent_id != child_id)
);



-- =====================================================================
-- BẢNG HÔN NHÂN
-- =====================================================================

CREATE TABLE IF NOT EXISTS marriages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    husband_id      INTEGER,
    wife_id         INTEGER,
    marriage_date   TEXT,
    divorce_date    TEXT,
    notes           TEXT,

    FOREIGN KEY (husband_id) REFERENCES people(id) ON DELETE SET NULL,
    FOREIGN KEY (wife_id)   REFERENCES people(id) ON DELETE SET NULL,

    UNIQUE(husband_id, wife_id),
    CHECK(husband_id != wife_id)
);

-- Husband phải là Nam (INSERT)
CREATE TRIGGER IF NOT EXISTS check_husband_gender_insert
BEFORE INSERT ON marriages
FOR EACH ROW
WHEN (NEW.husband_id IS NOT NULL AND 
      (SELECT gender FROM people WHERE id = NEW.husband_id) != 'Nam')
BEGIN
    SELECT RAISE(ABORT, 'Lỗi logic: husband_id phải trỏ tới người có giới tính Nam.');
END;

-- Husband phải là Nam (UPDATE)
CREATE TRIGGER IF NOT EXISTS check_husband_gender_update
BEFORE UPDATE OF husband_id ON marriages
FOR EACH ROW
WHEN (NEW.husband_id IS NOT NULL AND 
      (SELECT gender FROM people WHERE id = NEW.husband_id) != 'Nam')
BEGIN
    SELECT RAISE(ABORT, 'Lỗi logic: husband_id phải trỏ tới người có giới tính Nam.');
END;

-- Wife phải là Nữ (INSERT)
CREATE TRIGGER IF NOT EXISTS check_wife_gender_insert
BEFORE INSERT ON marriages
FOR EACH ROW
WHEN (NEW.wife_id IS NOT NULL AND 
      (SELECT gender FROM people WHERE id = NEW.wife_id) != 'Nữ')
BEGIN
    SELECT RAISE(ABORT, 'Lỗi logic: wife_id phải trỏ tới người có giới tính Nữ.');
END;

-- Wife phải là Nữ (UPDATE)
CREATE TRIGGER IF NOT EXISTS check_wife_gender_update
BEFORE UPDATE OF wife_id ON marriages
FOR EACH ROW
WHEN (NEW.wife_id IS NOT NULL AND 
      (SELECT gender FROM people WHERE id = NEW.wife_id) != 'Nữ')
BEGIN
    SELECT RAISE(ABORT, 'Lỗi logic: wife_id phải trỏ tới người có giới tính Nữ.');
END;



-- =====================================================================
-- INDEX TỐI ƯU
-- =====================================================================

-- People
CREATE INDEX IF NOT EXISTS idx_people_name ON people(full_name);

-- Relationships
CREATE INDEX IF NOT EXISTS idx_relationships_parent ON relationships(parent_id);
CREATE INDEX IF NOT EXISTS idx_relationships_child ON relationships(child_id);

-- Users
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_viewer_code ON users(viewer_code);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);