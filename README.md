# Cloud Drive Backend

Backend API for a secure cloud file storage application.

The backend provides authentication, file and folder management, file sharing, public links, starring, activity tracking, file versioning, trash/restore functionality, pagination, upload validation, access control, rate limiting, and secure file downloads.

---

## Tech Stack

- Node.js
- Express.js
- PostgreSQL
- Neon PostgreSQL
- JWT authentication
- HTTP-only cookies
- bcryptjs
- Multer
- Zod
- Helmet
- express-rate-limit
- pg
- Morgan

---

## Features

### Authentication

- User registration
- User login
- JWT-based authentication
- HTTP-only authentication cookie
- Protected API routes
- Logout
- Password hashing using bcrypt

### File Management

- Upload files
- List files
- Rename files
- Move files
- Delete files
- Restore deleted files
- Download files
- Recent files
- Storage statistics
- File search

### Folder Management

- Create folders
- List folders
- Rename folders
- Move folders
- Delete folders
- Restore folders
- Nested folder structure

### File Versioning

- Upload new file versions
- List file versions
- Download previous versions
- Restore previous versions
- SHA-256 checksums

### Sharing

- Direct file/folder sharing
- Viewer permissions
- Editor permissions
- Public share links
- Optional public-link passwords
- Public-link expiration
- Shared file downloads

### Starred Resources

- Star files
- Star folders
- Remove stars
- Check star status
- List starred resources

### Activity Tracking

- Activity logging
- User activity history

### Trash

- Soft deletion
- File restoration
- Folder restoration
- Automatic cleanup of old deleted resources

---

# Security

Security hardening was implemented across the API.

## Input Validation

API request parameters and request bodies are validated using Zod.

Validation is applied to:

- Authentication requests
- Folder operations
- File operations
- File versions
- Sharing
- Public links
- Starred resources
- Activity queries
- Pagination parameters
- Search parameters

Invalid input returns a standardized response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters"
  }
}