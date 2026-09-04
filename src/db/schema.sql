CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

/* =========================================================
   USERS
========================================================= */

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email TEXT UNIQUE NOT NULL,

    password_hash TEXT,

    name TEXT,

    image_url TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

/* =========================================================
   FOLDERS
========================================================= */

CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,

    owner_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    parent_id UUID
        REFERENCES folders(id)
        ON DELETE SET NULL,

    is_deleted BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    /*
     * Prevent impossible empty/whitespace-only folder names.
     */
    CONSTRAINT folders_name_not_blank
        CHECK (length(trim(name)) > 0),

    /*
     * Prevent excessively large names at DB level too.
     */
    CONSTRAINT folders_name_length
        CHECK (length(name) <= 255)
);

/* =========================================================
   FOLDER INDEXES
========================================================= */

CREATE UNIQUE INDEX IF NOT EXISTS folders_owner_parent_name_unique
ON folders(owner_id, parent_id, name)
WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS folders_owner_idx
ON folders(owner_id);

CREATE INDEX IF NOT EXISTS folders_parent_idx
ON folders(parent_id);

CREATE INDEX IF NOT EXISTS folders_owner_parent_active_idx
ON folders(owner_id, parent_id)
WHERE is_deleted = FALSE;

/* =========================================================
   FILES
========================================================= */

CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,

    mime_type TEXT,

    size_bytes BIGINT,

    storage_key TEXT UNIQUE NOT NULL,

    owner_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    folder_id UUID
        REFERENCES folders(id)
        ON DELETE SET NULL,

    version_id UUID,

    checksum TEXT,

    is_deleted BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    /*
     * File names must not be blank.
     */
    CONSTRAINT files_name_not_blank
        CHECK (length(trim(name)) > 0),

    /*
     * File names are limited to the same size enforced
     * by the API.
     */
    CONSTRAINT files_name_length
        CHECK (length(name) <= 255),

    /*
     * File sizes cannot be negative.
     */
    CONSTRAINT files_size_nonnegative
        CHECK (
            size_bytes IS NULL
            OR size_bytes >= 0
        )
);

/* =========================================================
   FILE INDEXES
========================================================= */

CREATE INDEX IF NOT EXISTS files_owner_idx
ON files(owner_id);

CREATE INDEX IF NOT EXISTS files_folder_idx
ON files(folder_id);

CREATE INDEX IF NOT EXISTS files_name_owner_idx
ON files(name, owner_id);

CREATE INDEX IF NOT EXISTS files_name_trgm_idx
ON files USING GIN (
    name gin_trgm_ops
);

/*
 * Optimizes the common "list active files in folder"
 * query pattern.
 */
CREATE INDEX IF NOT EXISTS files_owner_folder_active_idx
ON files(owner_id, folder_id)
WHERE is_deleted = FALSE;

/*
 * Optimizes owner trash queries.
 */
CREATE INDEX IF NOT EXISTS files_owner_deleted_updated_idx
ON files(owner_id, updated_at DESC)
WHERE is_deleted = TRUE;

/* =========================================================
   FILE VERSIONS
========================================================= */

CREATE TABLE IF NOT EXISTS file_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    file_id UUID NOT NULL
        REFERENCES files(id)
        ON DELETE CASCADE,

    version_number INTEGER NOT NULL,

    storage_key TEXT NOT NULL,

    size_bytes BIGINT,

    checksum TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    /*
     * Version numbers start at 1.
     */
    CONSTRAINT file_versions_number_positive
        CHECK (version_number > 0),

    /*
     * Version sizes cannot be negative.
     */
    CONSTRAINT file_versions_size_nonnegative
        CHECK (
            size_bytes IS NULL
            OR size_bytes >= 0
        ),

    UNIQUE(file_id, version_number)
);

/*
 * Optimizes version listing for a file.
 */
CREATE INDEX IF NOT EXISTS file_versions_file_idx
ON file_versions(file_id);

CREATE INDEX IF NOT EXISTS file_versions_file_created_idx
ON file_versions(file_id, created_at DESC);

/* =========================================================
   CURRENT FILE VERSION FOREIGN KEY
========================================================= */

ALTER TABLE files
ADD CONSTRAINT files_current_version_fk
FOREIGN KEY (version_id)
REFERENCES file_versions(id)
ON DELETE SET NULL;

/* =========================================================
   SHARES
========================================================= */

CREATE TABLE IF NOT EXISTS shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    resource_type TEXT NOT NULL
        CHECK (
            resource_type IN ('file', 'folder')
        ),

    resource_id UUID NOT NULL,

    grantee_user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    role TEXT NOT NULL
        CHECK (
            role IN ('viewer', 'editor')
        ),

    created_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(
        resource_type,
        resource_id,
        grantee_user_id
    )
);

/* =========================================================
   SHARE INDEXES
========================================================= */

CREATE INDEX IF NOT EXISTS shares_resource_idx
ON shares(
    resource_type,
    resource_id
);

/*
 * Important for "shared with me" queries.
 */
CREATE INDEX IF NOT EXISTS shares_grantee_idx
ON shares(grantee_user_id);

/*
 * Helps combined resource + user permission lookups.
 */
CREATE INDEX IF NOT EXISTS shares_resource_grantee_idx
ON shares(
    resource_type,
    resource_id,
    grantee_user_id
);

/* =========================================================
   PUBLIC LINK SHARES
========================================================= */

CREATE TABLE IF NOT EXISTS link_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    resource_type TEXT NOT NULL
        CHECK (
            resource_type IN ('file', 'folder')
        ),

    resource_id UUID NOT NULL,

    token TEXT UNIQUE NOT NULL,

    /*
     * Public links are intentionally viewer-only.
     */
    role TEXT NOT NULL DEFAULT 'viewer'
        CHECK (
            role = 'viewer'
        ),

    password_hash TEXT,

    expires_at TIMESTAMPTZ,

    created_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

/* =========================================================
   PUBLIC LINK INDEXES
========================================================= */

CREATE INDEX IF NOT EXISTS link_shares_resource_idx
ON link_shares(
    resource_type,
    resource_id
);

/*
 * Token is already UNIQUE, so PostgreSQL automatically
 * maintains a unique index for token lookups.
 */

/* =========================================================
   STARS
========================================================= */

CREATE TABLE IF NOT EXISTS stars (
    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    resource_type TEXT NOT NULL
        CHECK (
            resource_type IN ('file', 'folder')
        ),

    resource_id UUID NOT NULL,

    PRIMARY KEY(
        user_id,
        resource_type,
        resource_id
    )
);

/*
 * Helps resource-centric star checks.
 */
CREATE INDEX IF NOT EXISTS stars_resource_idx
ON stars(
    resource_type,
    resource_id
);

/* =========================================================
   ACTIVITIES
========================================================= */

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    actor_id UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    action TEXT NOT NULL
        CHECK (
            action IN (
                'upload',
                'rename',
                'delete',
                'restore',
                'move',
                'share',
                'download'
            )
        ),

    resource_type TEXT NOT NULL
        CHECK (
            resource_type IN (
                'file',
                'folder'
            )
        ),

    resource_id UUID NOT NULL,

    context JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

/* =========================================================
   ACTIVITY INDEXES
========================================================= */

CREATE INDEX IF NOT EXISTS activities_created_idx
ON activities(created_at DESC);

CREATE INDEX IF NOT EXISTS activities_actor_created_idx
ON activities(
    actor_id,
    created_at DESC
);

/* =========================================================
   ADDITIONAL DATA INTEGRITY
========================================================= */

/*
 * File storage keys must never be blank.
 */
ALTER TABLE files
DROP CONSTRAINT IF EXISTS files_storage_key_not_blank;

ALTER TABLE files
ADD CONSTRAINT files_storage_key_not_blank
CHECK (
    length(trim(storage_key)) > 0
);

/*
 * Share roles/resource types are already protected above.
 * Public link roles are viewer-only.
 */

/* =========================================================
   MIGRATION NOTE
========================================================= */

/*
 * This file is safe to run repeatedly because the tables,
 * indexes, and most constraints use IF NOT EXISTS /
 * DROP IF EXISTS where appropriate.
 *
 * IMPORTANT:
 * Existing invalid data would prevent the new CHECK
 * constraints from being added. The application currently
 * validates new data before insertion.
 */