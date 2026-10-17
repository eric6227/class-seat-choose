import os
import stat
import atexit
import signal
from sqlalchemy import create_engine, inspect, text, event
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import get_settings
from app.crypto import encrypt_bytes, decrypt_bytes

settings = get_settings()

db_path = settings.DATABASE_URL.replace("sqlite:///", "")
if db_path.startswith("./"):
    db_path = db_path[2:]
data_dir = os.path.dirname(db_path) if os.path.dirname(db_path) else "data"
os.makedirs(data_dir, exist_ok=True)

_SQLITE_HEADER = b"SQLite format 3\x00"


def _is_valid_sqlite(filepath: str) -> bool:
    if not os.path.exists(filepath):
        return False
    if os.path.getsize(filepath) < len(_SQLITE_HEADER):
        return False
    try:
        with open(filepath, "rb") as f:
            return f.read(len(_SQLITE_HEADER)) == _SQLITE_HEADER
    except OSError:
        return False


class SecureSQLiteManager:
    _ENCRYPTED_SUFFIX = ".enc"
    _initialized: bool = False
    _instance: "SecureSQLiteManager | None" = None

    def __init__(self, db_actual_path: str):
        self._db_path = db_actual_path
        self._encrypted_path = db_actual_path + self._ENCRYPTED_SUFFIX
        SecureSQLiteManager._instance = self

    def prepare(self) -> str:
        if self._initialized:
            return self._db_path

        self._remove_journal_files()

        enc_exists = os.path.exists(self._encrypted_path)
        db_exists = os.path.exists(self._db_path)
        db_valid = _is_valid_sqlite(self._db_path) if db_exists else False

        if not enc_exists and not db_valid:
            if db_exists:
                os.remove(self._db_path)
            self._initialized = True
            return self._db_path

        if db_valid:
            if not enc_exists:
                self._encrypt_db_file()
        elif enc_exists:
            self._decrypt_db_file()

        self._initialized = True
        return self._db_path

    def sync(self):
        if not self._initialized:
            return
        if not _is_valid_sqlite(self._db_path):
            return
        self._encrypt_db_file()
        self._remove_journal_files()

    def cleanup(self):
        if not self._initialized:
            return
        self._wal_checkpoint()
        if _is_valid_sqlite(self._db_path):
            self._encrypt_db_file()
        self._remove_journal_files()
        self._initialized = False

    def _wal_checkpoint(self):
        try:
            import sqlite3
            conn = sqlite3.connect(self._db_path)
            try:
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            finally:
                conn.close()
        except Exception:
            pass

    def _encrypt_db_file(self):
        if not _is_valid_sqlite(self._db_path):
            return
        try:
            with open(self._db_path, "rb") as f:
                plain_data = f.read()
            encrypted = encrypt_bytes(plain_data)
            tmp_enc = self._encrypted_path + ".tmp"
            with open(tmp_enc, "wb") as f:
                f.write(encrypted)
            os.replace(tmp_enc, self._encrypted_path)
            _secure_file_perms(self._encrypted_path)
        except Exception:
            if os.path.exists(self._encrypted_path + ".tmp"):
                try:
                    os.remove(self._encrypted_path + ".tmp")
                except OSError:
                    pass
            raise

    def _decrypt_db_file(self):
        if not os.path.exists(self._encrypted_path):
            return
        try:
            with open(self._encrypted_path, "rb") as f:
                enc_data = f.read()
        except OSError:
            self._discard_encrypted()
            return

        if len(enc_data) < 28:
            self._discard_encrypted()
            return

        decrypted = decrypt_bytes(enc_data)
        if decrypted is None or not decrypted.startswith(_SQLITE_HEADER):
            self._discard_encrypted()
            return

        self._remove_journal_files()
        try:
            with open(self._db_path, "wb") as f:
                f.write(decrypted)
            _secure_file_perms(self._db_path)
        except OSError:
            raise RuntimeError("数据库写入失败：磁盘错误")

    def _discard_encrypted(self):
        if os.path.exists(self._encrypted_path):
            try:
                os.remove(self._encrypted_path)
            except OSError:
                pass
        print("警告：加密数据库文件损坏或密钥不匹配，已丢弃，将创建新数据库")

    def _remove_journal_files(self):
        for suffix in ["-wal", "-shm", "-journal"]:
            path = self._db_path + suffix
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass

    @classmethod
    def get_instance(cls) -> "SecureSQLiteManager | None":
        return cls._instance


def _secure_file_perms(filepath: str):
    try:
        os.chmod(filepath, stat.S_IRUSR | stat.S_IWUSR)
    except Exception:
        pass


_secure_manager = SecureSQLiteManager(db_path)
_secure_manager.prepare()

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
    echo=False,
    pool_size=5,
    max_overflow=0,
)

if "sqlite" in settings.DATABASE_URL:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
        except Exception:
            try:
                cursor.execute("PRAGMA journal_mode=MEMORY")
            except Exception:
                pass
        try:
            cursor.execute("PRAGMA synchronous=NORMAL")
        except Exception:
            pass
        try:
            cursor.execute("PRAGMA busy_timeout=5000")
        except Exception:
            pass
        cursor.close()

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _handle_shutdown(*args):
    manager = SecureSQLiteManager.get_instance()
    if manager:
        manager.cleanup()


atexit.register(_handle_shutdown)
signal.signal(signal.SIGTERM, _handle_shutdown)
if hasattr(signal, "SIGQUIT"):
    signal.signal(signal.SIGQUIT, _handle_shutdown)


def _migrate():
    inspector = inspect(engine)
    with engine.connect() as conn:
        if "admin_password" in inspector.get_table_names():
            conn.execute(text("ALTER TABLE admin_password RENAME TO teacher_password"))
            conn.commit()
        if "students" in inspector.get_table_names():
            existing = {c["name"] for c in inspector.get_columns("students")}
            if "student_id" not in existing:
                conn.execute(text("ALTER TABLE students ADD COLUMN student_id VARCHAR(50)"))
                conn.commit()
            if "gender" not in existing:
                conn.execute(text("ALTER TABLE students ADD COLUMN gender VARCHAR(4)"))
                conn.commit()
            if "rank" not in existing:
                conn.execute(text("ALTER TABLE students ADD COLUMN rank INTEGER"))
                conn.commit()
            if "selection_method" not in existing:
                conn.execute(text("ALTER TABLE students ADD COLUMN selection_method VARCHAR(50)"))
                conn.commit()
            if "round_id" not in existing:
                conn.execute(text("ALTER TABLE students ADD COLUMN round_id INTEGER"))
                conn.commit()
            if "password_updated_at" not in existing:
                conn.execute(text("ALTER TABLE students ADD COLUMN password_updated_at DATETIME"))
                conn.commit()
        if "seat_state" in inspector.get_table_names():
            existing = {c["name"] for c in inspector.get_columns("seat_state")}
            if "groups_count" not in existing:
                conn.execute(text("ALTER TABLE seat_state ADD COLUMN groups_count INTEGER DEFAULT 7"))
                conn.commit()
            if "rows_per_group" not in existing:
                conn.execute(text("ALTER TABLE seat_state ADD COLUMN rows_per_group INTEGER DEFAULT 2"))
                conn.commit()
            if "cols_per_group" not in existing:
                conn.execute(text("ALTER TABLE seat_state ADD COLUMN cols_per_group INTEGER DEFAULT 4"))
                conn.commit()
            if "has_pairs" not in existing:
                conn.execute(text("ALTER TABLE seat_state ADD COLUMN has_pairs BOOLEAN DEFAULT 1"))
                conn.commit()


def init_db():
    import tempfile

    global engine, SessionLocal, _secure_manager

    test_file = os.path.join(data_dir, ".write_test")
    can_write = False
    try:
        with open(test_file, "w") as f:
            f.write("test")
        os.remove(test_file)
        can_write = True
    except OSError:
        pass

    if not can_write:
        print(f"警告: 数据目录 {os.path.abspath(data_dir)} 不可写, 切换到临时目录")
        tmp_dir = os.path.join(tempfile.gettempdir(), "seat_system_data")
        os.makedirs(tmp_dir, exist_ok=True)
        tmp_db_path = os.path.join(tmp_dir, os.path.basename(db_path))
        print(f"数据库路径: {tmp_db_path}")

        _secure_manager = SecureSQLiteManager(tmp_db_path)
        _secure_manager.prepare()

        new_url = f"sqlite:///{tmp_db_path}"
        engine = create_engine(
            new_url,
            connect_args={"check_same_thread": False},
            echo=False,
            pool_size=5,
            max_overflow=0,
        )

        @event.listens_for(engine, "connect")
        def _pragma_fallback(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA journal_mode=MEMORY")
            except Exception:
                pass
            try:
                cursor.execute("PRAGMA synchronous=NORMAL")
            except Exception:
                pass
            cursor.close()

        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    Base.metadata.create_all(bind=engine)
    engine.dispose()
    _migrate()