BEGIN;

INSERT INTO roles(role_name)
SELECT 'coordinator'
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE role_name = 'coordinator'
);

UPDATE users
SET username = 'kordinator',
    full_name = 'Koordinator',
    password_hash = '853cd01bbf6ea53f3873b496166b3317768cf0cc38b6e41b05563fbed97fa9d7',
    role_id = (SELECT role_id FROM roles WHERE role_name = 'admin'),
    department_id = NULL
WHERE user_id = 1 OR username = 'admin';

UPDATE users
SET username = 'mustafa.sert',
    full_name = 'MUSTAFA SERT',
    password_hash = '6541bf3f47b7431a69d5d8331201c17b58acd271a31ee7417eb53e9c00d87a03',
    role_id = (SELECT role_id FROM roles WHERE role_name = 'instructor'),
    department_id = (
        SELECT department_id
        FROM departments
        WHERE department_name = 'Bilgisayar Mühendisliği'
    )
WHERE username = 'cagatay.erdas';

INSERT INTO users(username, full_name, password_hash, role_id, department_id)
VALUES
    (
        'fakulte.sorumlusu',
        'Fakülte Program Sorumlusu',
        'c611c3c6306e2e8503b15784e159c2c8e2fafe1e9c2bffd38de9dda142e83adc',
        (SELECT role_id FROM roles WHERE role_name = 'dept_chair'),
        NULL
    ),
    (
        'bil.kordinator',
        'Bilgisayar Bölüm Koordinatörü',
        'c465e0277d74f55ac01a13fd7fa7c99c2943f98fbcba2cef9aa63dbc5a188784',
        (SELECT role_id FROM roles WHERE role_name = 'coordinator'),
        (SELECT department_id FROM departments WHERE department_name = 'Bilgisayar Mühendisliği')
    ),
    (
        'bil.sekreter',
        'Bilgisayar Bölüm Sekreteri',
        'ab9511b766f31444804ff76451f344f5e8f56111c0f3af91ff4d2640b72414d0',
        (SELECT role_id FROM roles WHERE role_name = 'secretary'),
        (SELECT department_id FROM departments WHERE department_name = 'Bilgisayar Mühendisliği')
    ),
    (
        'goruntuleyici',
        'Program Görüntüleyici',
        '7e3bb15c153e7edfb02e6b2431c3970d81e306c26ccc102a46447c275531bde6',
        (SELECT role_id FROM roles WHERE role_name = 'viewer'),
        NULL
    )
ON CONFLICT (username) DO UPDATE
SET full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    role_id = EXCLUDED.role_id,
    department_id = EXCLUDED.department_id;

COMMIT;
