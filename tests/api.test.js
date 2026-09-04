const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const BASE_URL =
  process.env.TEST_BASE_URL ||
  "http://localhost:5000";

const randomEmail =
  `test-${Date.now()}-${crypto.randomBytes(4).toString("hex")}@example.com`;

const testPassword =
  "TestPassword123!";

let authCookie = "";

const request = async (
  method,
  endpoint,
  options = {}
) => {
  const headers = {
    ...(options.headers || {}),
  };

  if (authCookie) {
    headers.Cookie = authCookie;
  }

  const response = await fetch(
    `${BASE_URL}${endpoint}`,
    {
      method,
      headers,
      body: options.body,
    }
  );

  const text =
    await response.text();

  let data = null;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    response,
    data,
  };
};

/* =========================================================
   HEALTH CHECK
========================================================= */

test("GET /health returns API status", async () => {
  const {
    response,
    data,
  } = await request(
    "GET",
    "/health"
  );

  assert.equal(
    response.status,
    200
  );

  assert.equal(
    data.success,
    true
  );

  assert.equal(
    data.status,
    "ok"
  );
});

/* =========================================================
   ROUTE NOT FOUND
========================================================= */

test("Unknown API route returns standardized 404", async () => {
  const {
    response,
    data,
  } = await request(
    "GET",
    "/api/test-route-that-does-not-exist"
  );

  assert.equal(
    response.status,
    404
  );

  assert.equal(
    data.error.code,
    "ROUTE_NOT_FOUND"
  );

  assert.ok(
    data.error.message
  );
});

/* =========================================================
   INVALID REGISTRATION
========================================================= */

test("Invalid registration input returns 400 validation error", async () => {
  const {
    response,
    data,
  } = await request(
    "POST",
    "/api/auth/register",
    {
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        name: "",
        email: "not-an-email",
        password: "123",
      }),
    }
  );

  assert.equal(
    response.status,
    400
  );

  assert.equal(
    data.error.code,
    "VALIDATION_ERROR"
  );

  assert.ok(
    Array.isArray(
      data.error.details
    )
  );
});

/* =========================================================
   REGISTER TEST USER
========================================================= */

test("Register creates a test user", async () => {
  const {
    response,
    data,
  } = await request(
    "POST",
    "/api/auth/register",
    {
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        name: "Automated Test User",
        email: randomEmail,
        password:
          testPassword,
      }),
    }
  );

  assert.ok(
    response.status === 200 ||
    response.status === 201
  );

  assert.equal(
    data.success,
    true
  );
});

/* =========================================================
   LOGIN
========================================================= */

test("Login returns authentication cookie", async () => {
  const {
    response,
    data,
  } = await request(
    "POST",
    "/api/auth/login",
    {
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        email: randomEmail,
        password:
          testPassword,
      }),
    }
  );

  assert.equal(
    response.status,
    200
  );

  assert.equal(
    data.success,
    true
  );

  const setCookie =
    response.headers.get(
      "set-cookie"
    );

  assert.ok(
    setCookie,
    "Login should return a session cookie"
  );

  authCookie =
    setCookie
      .split(";")[0];
});

/* =========================================================
   AUTHENTICATED ME
========================================================= */

test("Authenticated user can access /me", async () => {
  assert.ok(
    authCookie,
    "Authentication cookie must exist"
  );

  const {
    response,
    data,
  } = await request(
    "GET",
    "/api/auth/me"
  );

  assert.equal(
    response.status,
    200
  );

  assert.equal(
    data.success,
    true
  );
});

/* =========================================================
   MISSING AUTHENTICATION
========================================================= */

test("Protected endpoint rejects missing authentication", async () => {
  const previousCookie =
    authCookie;

  authCookie = "";

  const {
    response,
    data,
  } = await request(
    "GET",
    "/api/files"
  );

  authCookie =
    previousCookie;

  assert.equal(
    response.status,
    401
  );

  assert.ok(
    data.error
  );

  assert.equal(
    data.error.code,
    "UNAUTHORIZED"
  );
});

/* =========================================================
   PAGINATION VALIDATION
========================================================= */

test("Invalid pagination parameters are rejected", async () => {
  const {
    response,
    data,
  } = await request(
    "GET",
    "/api/files?page=abc&limit=abc"
  );

  assert.equal(
    response.status,
    400
  );

  assert.equal(
    data.error.code,
    "VALIDATION_ERROR"
  );
});

/* =========================================================
   PAGINATION RESPONSE
========================================================= */

test("Files endpoint returns pagination metadata", async () => {
  const {
    response,
    data,
  } = await request(
    "GET",
    "/api/files?page=1&limit=20"
  );

  assert.equal(
    response.status,
    200
  );

  assert.equal(
    data.success,
    true
  );

  assert.ok(
    Array.isArray(
      data.files
    )
  );

  assert.ok(
    data.pagination
  );

  assert.equal(
    data.pagination.page,
    1
  );

  assert.equal(
    data.pagination.limit,
    20
  );

  assert.ok(
    Number.isInteger(
      data.pagination.total
    )
  );

  assert.ok(
    Number.isInteger(
      data.pagination.totalPages
    )
  );
});

/* =========================================================
   PAGINATION LIMIT VALIDATION
========================================================= */

test("Pagination limit above 100 is rejected", async () => {
  const {
    response,
    data,
  } = await request(
    "GET",
    "/api/files?page=1&limit=101"
  );

  assert.equal(
    response.status,
    400
  );

  assert.equal(
    data.error.code,
    "VALIDATION_ERROR"
  );
});

/* =========================================================
   INVALID UUID
========================================================= */

test("Invalid file UUID is rejected", async () => {
  const {
    response,
    data,
  } = await request(
    "GET",
    "/api/files/not-a-valid-uuid/download"
  );

  assert.equal(
    response.status,
    400
  );

  assert.equal(
    data.error.code,
    "VALIDATION_ERROR"
  );
});

/* =========================================================
   INVALID STAR REQUEST
========================================================= */

test("Invalid star request is rejected", async () => {
  const {
    response,
    data,
  } = await request(
    "POST",
    "/api/stars",
    {
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        resourceType:
          "invalid",
        resourceId:
          "not-a-uuid",
      }),
    }
  );

  assert.equal(
    response.status,
    400
  );

  assert.equal(
    data.error.code,
    "VALIDATION_ERROR"
  );
});

/* =========================================================
   SEARCH VALIDATION
========================================================= */

test("Search endpoint validates query parameters", async () => {
  const {
    response,
    data,
  } = await request(
    "GET",
    "/api/files/search?q=test&page=abc"
  );

  assert.equal(
    response.status,
    400
  );

  assert.equal(
    data.error.code,
    "VALIDATION_ERROR"
  );
});

/* =========================================================
   AUTHENTICATED FILE ACCESS
========================================================= */

test("Authenticated user can access files endpoint", async () => {
  const {
    response,
    data,
  } = await request(
    "GET",
    "/api/files?page=1&limit=20"
  );

  assert.equal(
    response.status,
    200
  );

  assert.equal(
    data.success,
    true
  );
});